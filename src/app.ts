import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import OpenAI from "openai";
import { pipeline } from "stream";
import { promisify } from "util";
const chalk = require("chalk");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = express();
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
});

const pipelineAsync = promisify(pipeline);

const csvWriter = createObjectCsvWriter({
  path: "downloads/out.csv",
  header: [
    { id: "Author", title: "AUTHOR" },
    { id: "Quote", title: "QUOTE" },
    { id: "Topic", title: "TOPIC" },
    { id: "Tags", title: "TAGS" },
  ],
});

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
  
  ${quotes.map((q, idx) => `${idx + 1}."${q.Quote}" by ${q.Author}`).join("\n")}
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
    // console.log("OUTPUT", outputText.length, outputText);
    // console.log("QUOTES", quotes.length, quotes);
    if (outputText.length !== quotes.length) {
      console.error(chalk.red("Mismatch between input and output lengths."));
      return [];
    }

    // Update the original quotes with the categorized data
    for (let i = 0; i < quotes.length; i++) {
      // Dummy logic to extract "Topic" and "Tags" from outputText[i]
      // Replace this with the real logic based on how ChatGPT will respond

      const [, topic, tags] = outputText[i].split("|"); // Use destructuring to skip the quote part
      quotes[i].Topic = topic; // Assign the real topic
      quotes[i].Tags = tags; // Assign the real tags
    }

    return quotes;
  } catch (error) {
    console.error("Error in API call:", error);
    throw new Error("Error in categorizing data via API");
  }
};

let processedData: any[] = []; // Create a global array to store the processed data

async function handleChunks(rows: any[]) {
  try {
    console.log(chalk.blue("Processing a chunk of quotes..."));

    // Assuming getCategorizedQuotesV1 is already defined and works as expected
    const categorizedChunk = await getCategorizedQuotesV1(rows);

    processedData.push(...categorizedChunk); // Store the processed data
  } catch (error) {
    console.error(chalk.red("Error in categorizing chunk: "), error);
    throw new Error("Error in categorizing data"); // Throw error to be caught by main function
  }
  await sleep(1000); // simulate some delay
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (_, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send("No file uploaded");

    const inputFilePath = req.file.path;
    let rows: any[] = [];

    try {
      await pipelineAsync(
        fs.createReadStream(inputFilePath),
        csvParser(),
        async function* (source) {
          for await (const chunk of source) {
            rows.push(chunk);
            if (rows.length >= 500) {
              await handleChunks(rows);
              rows = [];
            }
          }
        }
      );

      if (rows.length > 0) {
        await handleChunks(rows);
      }

      // const outputFilePath = 'downloads/out.csv';
      // res.download(outputFilePath);

      try {
        await csvWriter.writeRecords(processedData);
        const outputFilePath = `downloads/out.csv`;
        res.download(outputFilePath);
        console.log(chalk.green("Done!!!"));

        processedData = []; // Clear the processedData for the next request
      } catch (error) {
        console.error(chalk.red("Error in writing CSV: "), error);
        return res.status(500).send("Error in writing CSV");
      }
    } catch (error) {
      console.error(chalk.red("Error: "), error);
      return res.status(500).send("Internal Server Error");
    }
  }
);

app.listen(process.env.PORT, () => {
  console.log(
    chalk.yellow(`Server running at http://localhost:${process.env.PORT}/`)
  );
});
