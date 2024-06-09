This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.


## Train using Python:
- [Python training examples](https://github.com/BimwerxNZ/bimwerx-bob/tree/main)

## Supabase SQL Steps

1. **Create an extension:**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

2. **Create the table:**
   ```sql
   CREATE TABLE document_embeddings (
       id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
       content text,
       metadata jsonb,
       embedding vector(768)
   );
   ```

3. **Create the `match_documents` function:**
   ```sql
   CREATE OR REPLACE FUNCTION match_documents(
       query_embedding vector(768), 
       match_count int = 5
   )
   RETURNS TABLE(
       id uuid,
       content text,
       metadata jsonb,
       similarity float
   )
   LANGUAGE plpgsql
   AS $$
   BEGIN
       RETURN QUERY
       SELECT
           d.id,
           d.content,
           d.metadata,
           (1 - (d.embedding <=> query_embedding)) AS similarity
       FROM
           documents d
       ORDER BY
           d.embedding <=> query_embedding
       LIMIT
           match_count;
   END;
   $$;
   ```

## To Insert into an Existing Webpage

1. **Add CSS Style to the page:**
   ```html
   <style>
        /* Chatbot button styles */
        #chatbot-button {
            position: fixed;
            bottom: 10px;
            left: 10px;
            height: 50px;
            width: 50px;
            background-color: #007bff;
            color: white;
            border: none;
            border-radius: 50%;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: pointer;
            z-index: 1000;
            font-size: 24px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            animation: pop 1s ease-in-out infinite alternate;
        }

        @keyframes pop {
            0% {
                transform: scale(1);
            }
            100% {
                transform: scale(1.2);
            }
        }

        /* Chatbot iframe styles */
        #chatbot-iframe-container {
            position: fixed;
            bottom: 70px;
            left: 10px;
            height: 0;
            width: 0;
            overflow: hidden; /* Ensure the content is hidden when minimized */
            transition: height 0.3s ease-in-out, width 0.3s ease-in-out; /* Explicitly define transitions for height and width */
            z-index: 1000;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            border-radius: 10px; /* Add rounded corners */
            border: 2px solid #007bff; /* Add a border */
        }

        #chatbot-iframe {
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 10px; /* Add rounded corners */
        }

        /* Expanded iframe styles */
        #chatbot-iframe-container.expanded {
            height: 500px !important;
            width: 400px !important; /* Adjust width if needed */
        }
    </style>
   ```

2. **Add HTML to the body:**
   ```html
   <!-- Chatbot button -->
    <div id="chatbot-button">
        💬
    </div>

    <!-- Chatbot iframe container -->
    <div id="chatbot-iframe-container">
        <iframe
            id="chatbot-iframe"
            src="https://[YOUR VERCEL APP URL].vercel.app"
        ></iframe>
    </div>

    <script>
        // Get the chatbot button and iframe container elements
        const chatbotButton = document.getElementById('chatbot-button');
        const chatbotIframeContainer = document.getElementById('chatbot-iframe-container');

        // Add a click event listener to the chatbot button
        chatbotButton.addEventListener('click', () => {
            // Toggle the expanded class on the iframe container
            console.log('Chatbot button clicked'); // Debugging log
            chatbotIframeContainer.classList.toggle('expanded');
            console.log('Iframe container classes:', chatbotIframeContainer.className); // Debugging log
        });

        // Stop the animation after 10 seconds or 10 iterations
        setTimeout(() => {
            chatbotButton.style.animation = 'none';
        }, 10000); // 10 seconds (10 iterations at 1s each)
    </script>
   ```




