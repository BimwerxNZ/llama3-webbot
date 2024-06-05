import { NextRequest, NextResponse } from "next/server";
import { Message as VercelChatMessage, StreamingTextResponse } from "ai";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { EmbeddingModel, FlagEmbedding } from "fastembed";
import { ChatGroq } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { HttpResponseOutputParser } from "langchain/output_parsers";
import { RunnableSequence, Runnable, RunnableLike } from "@langchain/core/runnables";
import { AIMessageChunk } from "@langchain/core/messages";
import nodemailer from "nodemailer";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;
const EMAIL_HOST = process.env.EMAIL_HOST!;
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT!, 10);
const EMAIL_USER = process.env.EMAIL_USER!;
const EMAIL_PASS = process.env.EMAIL_PASS!;
const EMAIL_RECIPIENT = process.env.EMAIL_RECIPIENT!;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`;
};

const TEMPLATE = `You are an AI assistant for BIMWERX. Avoid referring to 'context' in your responses, instead use 'knowledge', but only when required.
Respond with bulleted points when listing response content.
Never make up answers, if unsure, say: 'I am not sure, let me connect you with a BIMWERX person'.
Only answer questions related to the context, if the question is out of scope, say: 'I am not sure, let me connect you with a BIMWERX person'.
If you are unsure, ask the user for their contact email to connect them with a BIMWERX person.
Once the user provides a valid email address, respond with "I'm sending your query to the BIMWERX Team right away, a BIMWERX Team member will be in contact with you soon...".
Use the following context to answer the question:
{context}
Current conversation:
{chat_history}
User: {input}
AI:`;

async function initModel() {
  return FlagEmbedding.init({
    model: EmbeddingModel.BGEBaseENV15,
  });
}

async function embedQuery(model: FlagEmbedding, query: string): Promise<number[]> {
  const embeddings = model.embed([query]);
  const result: number[][] = [];
  for await (const embedding of embeddings) {
    result.push(embedding[0]); // Handle the nested array properly
  }
  return [...result[0]];
}

async function embedDocuments(model: FlagEmbedding, docs: string[]): Promise<number[][]> {
  const embeddings = model.embed(docs);
  const result: number[][] = [];
  for await (const embedding of embeddings) {
    result.push(embedding[0]); // Handle the nested array properly
  }
  return result;
}

async function loadRetriever() {
  const model = await initModel();
  const embeddings = {
    embedQuery: (query: string) => embedQuery(model, query),
    embedDocuments: (docs: string[]) => embedDocuments(model, docs),
  };

  const supabaseVectorStore = new SupabaseVectorStore(embeddings, {
    client: supabaseClient,
    tableName: "documents",
    queryName: "match_documents",
  });

  return supabaseVectorStore.asRetriever();
}

async function sendEmail(subject: string, text: string) {
  let transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS,
    },
  });

  let info = await transporter.sendMail({
    from: `"BIMWERX Bot" <${EMAIL_USER}>`, // sender address
    to: EMAIL_RECIPIENT, // list of receivers
    subject: subject, // Subject line
    text: text, // plain text body
  });

  console.log("Message sent: %s", info.messageId);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage).join("\n");
    const currentMessageContent = messages[messages.length - 1].content;

    const retriever = await loadRetriever();
    const relevantDocs = await retriever.invoke(currentMessageContent);
    
    console.log('Relevant Documents:', relevantDocs);
    
    // Extract context from relevant documents
    const context = relevantDocs.map(doc => {
      if ('content' in doc) {
        return doc.content;
      } else if ('description' in doc) {
        return doc.description; // Adjust according to the actual field name
      } else {
        return JSON.stringify(doc); // Fallback to stringify the entire document
      }
    }).join("\n");

    const prompt = PromptTemplate.fromTemplate(TEMPLATE);

    const model = new ChatGroq({
      temperature: 0.0,
      modelName: "llama3-70b-8192",
      apiKey: GROQ_API_KEY,
    });

    const outputParser = new HttpResponseOutputParser();

    const chain: Runnable<any, any> = RunnableSequence.from([
      {
        docs: (input) => retriever.invoke(input.input),
        input: (input) => input.input,
        chat_history: (input) => input.chat_history,
        context: (input) => input.context,
      },
      prompt,
      model as RunnableLike<any, AIMessageChunk>,
      outputParser,
    ]);

    const streamInput = {
      context: context,
      chat_history: formattedPreviousMessages,
      input: currentMessageContent,
    };

    console.log('Stream Input:', streamInput);

    const formattedPrompt = await prompt.format(streamInput);

    console.log('Formatted Prompt:', formattedPrompt);

    const stream = await chain.stream(streamInput);

    const decoder = new TextDecoder();
    let aiResponse = "";
    for await (const chunk of stream) {
      aiResponse += decoder.decode(chunk, { stream: true });
    }

    // Check if AI response includes the confirmation message
    let emailRequested = aiResponse.includes("I am not sure, let me connect you with a BIMWERX person. Please provide your contact email.");
    let userEmailProvided = false;
    let userEmail = "";

    // Check if user email was provided in the current message
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user" && lastMessage.content.includes("@")) {
        userEmailProvided = true;
        userEmail = lastMessage.content;
      }
    }

    // Check if AI response includes the final confirmation message
    let emailConfirmed = aiResponse.includes("I'm sending your query to the BIMWERX Team right away...");

    if (emailConfirmed && userEmailProvided) {
      const emailSubject = "User needs assistance from BIMWERX";
      const emailText = `A user asked a question that the AI could not answer. Here is the conversation so far:\n\n${formattedPreviousMessages}\n\nUser: ${currentMessageContent}\nAI: ${aiResponse}\n\nUser's Contact Email: ${userEmail}`;
      await sendEmail(emailSubject, emailText);
    }

    console.log('API: Streaming response...');

    // Convert aiResponse to ReadableStream with proper UTF-8 encoding
    const readableStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(aiResponse));
        controller.close();
      }
    });

    return new StreamingTextResponse(readableStream);
  } catch (e: any) {
    console.error('API Error:', e);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
