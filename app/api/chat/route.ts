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
  } catch (error) {
    console.error('Error creating or writing to directory:', error);
  }

  return FlagEmbedding.init({
    model: EmbeddingModel.BGEBaseENV15,
    cacheDir: localCacheDir,
  });
}

async function embedQuery(model: FlagEmbedding, query: string): Promise<number[]> {
  const embeddings = model.embed([query]);
  const result: number[][] = [];
  for await (const embedding of embeddings) {
    result.push(embedding[0]);
  }
  return [...result[0]];
}

async function embedDocuments(model: FlagEmbedding, docs: string[]): Promise<number[][]> {
  const embeddings = model.embed(docs);
  const result: number[][] = [];
  for await (const embedding of embeddings) {
    result.push(embedding[0]);
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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { ChatGroq, HumanMessage } from "@langchain/groq";
import { PromptTemplate } from "@langchain/core/prompts";
import { HttpResponseOutputParser } from "langchain/output_parsers";
import path from 'path';
import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_KEY!;
const GROQ_API_KEY = process.env.GROQ_API_KEY!;

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const formatMessage = (message) => {
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
  if (!fs.existsSync(localCacheDir)) {
    fs.mkdirSync(localCacheDir, { recursive: true });
    fs.chmodSync(localCacheDir, 0o777);
  }
  return FlagEmbedding.init({
    model: EmbeddingModel.BGEBaseENV15,
    cacheDir: localCacheDir,
  });
}

async function embedQuery(model, query) {
  const embeddings = model.embed([query]);
  const result = [];
  for await (const embedding of embeddings) {
    result.push(embedding[0]);
  }
  return [...result[0]];
}

async function embedDocuments(model, docs) {
  const embeddings = model.embed(docs);
  const result = [];
  for await (const embedding of embeddings) {
    result.push(embedding[0]);
  }
  return result;
}

async function loadRetriever() {
  const model = await initModel();
  const embeddings = {
    embedQuery: (query) => embedQuery(model, query),
    embedDocuments: (docs) => embedDocuments(model, docs),
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

    const context = relevantDocs.map(doc => {
      if ('content' in doc) {
        return doc.content;
      } else if ('description' in doc) {
        return doc.description;
      } else {
        return JSON.stringify(doc);
      }
    }).join("\n");

    const prompt = PromptTemplate.fromTemplate(TEMPLATE);

    const model = new ChatGroq({
      temperature: 0.0,
      modelName: "mixtral-8x7b-32768",
      apiKey: GROQ_API_KEY,
    });

    const outputParser = new HttpResponseOutputParser();

    const streamInput = {
      context: context,
      chat_history: formattedPreviousMessages,
      input: currentMessageContent,
    };

    const formattedPrompt = await prompt.format(streamInput);

    const response = await model.invoke([new HumanMessage(formattedPrompt)]);

    const parsedResponse = await outputParser.parse(response.message);

    return NextResponse.json({ message: parsedResponse });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status ?? 500 });
  }
}




