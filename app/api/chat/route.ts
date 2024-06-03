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

import path from 'path';
import fs from 'fs';

// export const runtime = "edge";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const formatMessage = (message: VercelChatMessage) => {
  return `${message.role}: ${message.content}`;
};

const TEMPLATE = `You are an AI assistant for BIMWERX. Avoid referring to 'context' in your responses, instead use 'knowledge', but only when required.
Respond with bulleted points when listing response content.
Never make up answers, if unsure, say: 'I am not sure, let me connect you with a BIMWERX person'.
Only answer questions related to the context, if the question is out of scope, say: 'I am not sure, let me connect you with a BIMWERX person'.
Use the following context to answer the question:
{context}
Current conversation:
{chat_history}
User: {input}
AI:`;

async function initModel() {
  const localCacheDir = path.join('/tmp', 'local_cache');
  try {
    if (!fs.existsSync(localCacheDir)) {
      fs.mkdirSync(localCacheDir, { recursive: true });
      fs.chmodSync(localCacheDir, 0o777);
    }
    // Test write access
    fs.writeFileSync(path.join(localCacheDir, 'test_write.txt'), 'test');
    console.log('Directory is writable');
  } catch (error) {
    console.error('Error creating or writing to directory:', error);
  }

  return FlagEmbedding.init({
    model: EmbeddingModel.BGEBaseENV15,
    cacheDir: localCacheDir,
  });
}

//async function initModel() {
//  const localCacheDir = path.join('/mnt/volume_syd1_01', 'local_cache');
//  try {
//    if (!fs.existsSync(localCacheDir)) {
//      fs.mkdirSync(localCacheDir, { recursive: true });
//      fs.chmodSync(localCacheDir, 0o777);
//    }
//  } catch (error) {
//    console.error('Error creating directory:', error);
//  }

//  return FlagEmbedding.init({
//    model: EmbeddingModel.BGEBaseENV15,
//    cacheDir: localCacheDir,
//  });
//}

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages ?? [];
    const formattedPreviousMessages = messages.slice(0, -1).map(formatMessage).join("\n");
    const currentMessageContent = messages[messages.length - 1].content;

    const retriever = await loadRetriever();
    const relevantDocs = await retriever.getRelevantDocuments(currentMessageContent);
    
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
        docs: (input) => retriever.getRelevantDocuments(input.input),
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

    console.log('API: Streaming response...');
    return new StreamingTextResponse(stream);
  } catch (e: any) {
    console.error('API Error:', e);
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}
