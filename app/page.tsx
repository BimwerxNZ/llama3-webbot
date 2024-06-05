'use client';

import { useState, useEffect, useRef } from 'react';
import { useChat, Message } from 'ai/react';
import Image from 'next/image';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FiSend } from 'react-icons/fi';
import ReactMarkdown from 'react-markdown';  // Import react-markdown

export default function Chat() {
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { messages, input, handleInputChange, handleSubmit, setInput, setMessages } = useChat({
    initialMessages: [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Hi, I am BIMWERX Bob, ask me anything about BIMWERX FEA software.'
      }
    ]
  });

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const customHandleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!input) return;

    console.log("Submitting question...");

    setLoading(true);

    const newMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: input,
    };

    setMessages([...messages, newMessage]);
    setInput('');

    try {
      console.log("Sending request to API...");
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [...messages, newMessage] }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let aiMessageContent = '';

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        done = streamDone;
        aiMessageContent += decoder.decode(value, { stream: !done });
      }

      const aiMessage: Message = {
        id: String(Date.now()),
        role: 'assistant',
        content: aiMessageContent,
      };

      console.log("API response received: ", aiMessageContent);
      setMessages([...messages, newMessage, aiMessage]);
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast(error.message, { theme: "dark" });
        console.error('Error fetching AI response:', error);
      }
    } finally {
      setLoading(false);
      console.log("Finished fetching response.");
    }
  };

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch bg-gray-100 min-h-screen">
      <div className="header w-full max-w-md mx-auto">
        <h1>BIMWERX Bob</h1>
      </div>
      <div className="content flex flex-col space-y-4 p-4 bg-white shadow-md rounded-md overflow-auto" style={{ flexGrow: 1 }}>
        {messages.map((m) => (
          <div key={m.id} className={`whitespace-pre-wrap p-2 rounded-md flex items-start ${m.role === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-800'}`}>
            {m.role === 'assistant' && (
              <div className="flex items-center mr-2">
                <Image src="/chatlogo.png" alt="AI Logo" width={32} height={32} className="fixed-size" />
              </div>
            )}
            <div>
              <strong>{m.role === 'user' ? 'User: ' : 'AI: '}</strong>
              <ReactMarkdown>{m.content}</ReactMarkdown>  {/* Render markdown content */}
            </div>
          </div>
        ))}
        {loading && (
          <div className="whitespace-pre-wrap p-2 rounded-md flex items-start bg-gray-200 text-gray-800 animated-background">
            <div className="loader mr-2"></div> {/* Spinning loader */}
            <div>
              <strong>AI: </strong><span className="ellipsis">Thinking</span>  {/* Apply ellipsis animation */}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={customHandleSubmit} className="fixed bottom-0 w-full max-w-md p-4 bg-white border-t border-gray-300 shadow-xl">
        <div className="relative w-full">
          <input
            className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
            value={input}
            placeholder="Ask a question..."
            onChange={handleInputChange}
            style={{ color: 'black', backgroundColor: 'white' }}
          />
          <button type="submit" className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-600">
            <FiSend className="w-6 h-6" />
          </button>
        </div>
      </form>
      <ToastContainer />
    </div>
  );
}
