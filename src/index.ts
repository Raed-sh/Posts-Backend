import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import csvParser from "csv-parser";
import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import OpenAI from "openai";
const chalk = require("chalk");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// Initialize
const app = express();
app.use(express.json());
// Setup Multer
const upload = multer({ dest: "uploads/" });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY as string,
});

// Utility function to chunk array
const chunkArray = (array: any[], size: number): any[][] => {
  console.log(chalk.green("Chunking array..."));
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
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

${quotes.map((q, idx) => `${idx + 1}."${q.Quote}" by ${q.Author}`).join("\n")}
`;

  console.log(_prompt);
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
    console.log(completion.choices[0].message.content);
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

// CSV Writer
const csvWriter = createObjectCsvWriter({
  path: "downloads/out.csv",
  header: [
    { id: "Author", title: "AUTHOR" },
    { id: "Quote", title: "QUOTE" },
    { id: "Topic", title: "TOPIC" },
    { id: "Tags", title: "TAGS" },
  ],
});

// Serve static files
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/", (_, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.post(
  "/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) return res.status(400).send("No file uploaded");
    console.log(chalk.green("Reading uploaded CSV file..."));
    const filePath = req.file.path;
    const readStream = fs.createReadStream(filePath);

    let rows: any[] = [];

    readStream
      .pipe(csvParser())
      .on("data", (row) => {
        rows.push(row);
      })
      .on("end", async () => {
        console.log(
          chalk.green("Finished reading CSV. Starting processing...")
        );
        // Chunk the rows into groups of 50
        const chunkedRows = chunkArray(rows, 100);

        let processedData: any[] = [];

        for (const chunk of chunkedRows) {
          try {
            console.log(chalk.blue("Processing a chunk of quotes..."));
            const categorizedChunk = await getCategorizedQuotesV1(chunk);

            // // Check the length for each chunk instead of the entire array
            // if (categorizedChunk.length !== chunk.length) {
            //   console.error(
            //     chalk.red("Mismatch between input and output lengths.")
            //   );
            //   return res.status(500).send("Error in categorizing data");
            // }

            processedData.push(...categorizedChunk);
            sleep(2000);
          } catch (error) {
            console.error(chalk.red("Error in categorizing chunk: "), error);
            return res.status(500).send("Error in categorizing data");
          }
        }
        console.log(chalk.green("Writing processed data to new CSV..."));

        // Write the processed data to a new CSV
        try {
          await csvWriter.writeRecords(processedData);
          const filePath = `downloads/out.csv`;
          res.download(filePath);
          console.log(chalk.green("Done!!!"));
        } catch (error) {
          console.error(chalk.red("Error in writing CSV: "), error);
          return res.status(500).send("Error in writing CSV");
        }
      });
  }
);

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

app.listen(process.env.PORT, () => {
  console.log(
    chalk.yellow(`Server running at http://localhost:${process.env.PORT}/`)
  );
});
