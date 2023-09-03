// index.ts
import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import { Queue, Worker } from "bullmq";
import chalk from "chalk";
import OpenAI from "openai";

// Load environment variables
require("dotenv").config();

const app = express();
const upload = multer({ dest: "uploads/" });
const openai = new OpenAI();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// CSV Writer Configuration
const csvWriter = createObjectCsvWriter({
  path: "downloads/out.csv",
  header: [
    { id: "Author", title: "AUTHOR" },
    { id: "Quote", title: "QUOTE" },
    { id: "Topic", title: "TOPIC" },
    { id: "Tags", title: "TAGS" },
  ],
});

// Utility function to sleep
function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Utility function to chunk array
const chunkArray = (array: any[], size: number): any[][] => {
  console.log(chalk.green(`Chunking array into sizes of ${size}...`));

  if (size <= 0) {
    console.error(chalk.red("Invalid chunk size. Must be greater than zero."));
    throw new Error("Invalid chunk size");
  }

  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    const chunk = array.slice(i, i + size);
    chunks.push(chunk);
    console.log(
      chalk.blue(`Created chunk ${chunks.length} with ${chunk.length} items.`)
    );
  }

  return chunks;
};

const MAX_RETRIES = 7; // Maximum number of retries

const handleChunks = async (chunks: any[][]): Promise<any[]> => {
  let processedData: any[] = [];

  for (const [index, chunk] of chunks.entries()) {
    let retryCount = 0;
    let success = false;

    while (!success && retryCount < MAX_RETRIES) {
      try {
        console.log(`Processing chunk ${index + 1}...`);
        const categorizedChunk = await getCategorizedQuotesV1(chunk);

        if (categorizedChunk.length !== chunk.length) {
          throw new Error("Mismatch between input and output lengths.");
        }

        processedData.push(...categorizedChunk);
        success = true;
        sleep(5000);
      } catch (error) {
        console.error(`Error in categorizing chunk ${index + 1}: `, error);
        retryCount++;
        console.log(
          chalk.yellowBright(
            `Retrying... (${retryCount}/${MAX_RETRIES}) after 10 seconds`
          )
        );
        sleep(10000);
      }
    }

    if (retryCount >= MAX_RETRIES) {
      console.error(chalk.red("Max retries reached. Aborting."));
      throw new Error("Max retries reached.");
    }
  }

  return processedData;
};

const getCategorizedQuotesV1 = async (quotes: any[]): Promise<any[]> => {
  console.log(chalk.green("Starting to categorize quotes..."));
  // Prepare the data to send to ChatGPT
  const _prompt = `I want to give a long list of quotes, and I need your help categorizing them in a single-word category/topic, each quote should have 1 single category. And then provide up to 3 tags for each quote.
    
    Please provide them in quote|topic|tag1,tag2,tag3 format.
    
    When you want to categorize a quote:
    1. Try to see if it matches a topic you already created instead of creating a new topic
    2. Bring back the quote full text (don't strip it)
    3. Try to pick topics that are common/popular over the internet
    
    Here are the quotes:
    
    ${quotes
      .map((q, idx) => `${idx + 1}."${q.Quote}" by ${q.Author}`)
      .join("\n")}
    `;

  try {
    console.log(chalk.blue("Making API call to OpenAI..."));
    // Make the API call

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that categorizes quotes.",
        },
        { role: "user", content: _prompt },
      ],
      model: "gpt-3.5-turbo-16k",
    });

    // Process the response
    const outputText =
      completion.choices[0].message.content?.trim().split("\n") || [];
    console.log(outputText.length);

    console.log(chalk.blue("Processing OpenAI API response..."));
    if (outputText.length !== quotes.length) {
      console.error(chalk.red("Mismatch between input and output lengths."));
      return [];
    }

    // Update the original quotes with the categorized data
    for (let i = 0; i < quotes.length; i++) {
      const [, topic, tags] = outputText[i].split("|"); // Use destructuring to skip the quote part
      quotes[i].Topic = topic;
      quotes[i].Tags = tags;
    }
    return quotes;
  } catch (error) {
    console.error("Error in API call:", error);
    throw new Error("Error in categorizing data via API");
  }
};

app.get("/", (_, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.get("/download", (req: Request, res: Response) => {
  const filePath = "downloads/out.csv"; // Make sure this path is correct
  res.download(filePath);
});

app.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send("No file uploaded");

    const filePath = req.file.path;
    const readStream = fs.createReadStream(filePath);

    let rows: any[] = [];

    readStream
      .pipe(csvParser())
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", async () => {
        try {
          const chunkedRows = chunkArray(rows, 50);
          const results = await handleChunks(chunkedRows);
          console.log(chalk.green("Writing results to out.csv"));
          csvWriter.writeRecords(results);
          res.sendFile(path.join(__dirname, "..", "public", "download.html"));
          console.log(
            chalk.cyanBright(
              "File is ready to download on http://localhost:5000/download"
            )
          );
        } catch (error) {
          console.error("Fatal error: ", error);
          return res.status(500).send("An error occurred during processing.");
        }
      });
  }
);

app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});
