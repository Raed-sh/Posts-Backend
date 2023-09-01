import express, { Response, Request } from "express";
import multer from "multer";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import { parse } from "fast-csv";
import { Parser } from "json2csv";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const information = [
  {
    Name: "Raed",
    Age: "25",
    City: "Amman",
  },
  {
    Name: "Raed",
    Age: "25",
    City: "Amman",
  },
  {
    Name: "Raed",
    Age: "25",
    City: "Amman",
  },
  {
    Name: "Raed",
    Age: "25",
    City: "Amman",
  },
  {
    Name: "Raed",
    Age: "25",
    City: "Amman",
  },
];

// Multer Config

let storage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, "./uploads/");
  },
  filename: (req, file, callback) => {
    callback(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

let upload = multer({
  storage: storage,
});

app.get("/", (req: Request, res: Response) => {
  res.sendFile(__dirname + "/index.html");
});

app.post(
  "/manipulation",
  upload.single("file"),
  (req: Request, res: Response) => {
    console.log(req.file?.path);
    uploadCSV(__dirname + "/uploads/" + req.file?.filename);
    // const csv = exportCSV(data);
    // res.attachment("data.csv");
    // res.status(201).send(csv);
    res.send("Records Logged!");
  }
);

function uploadCSV(path: string) {
  let stream = fs.createReadStream(path);

  let csvDataColl: any[] = [];

  let fileStream = parse()
    .on("data", (data) => {
      csvDataColl.push(data);
    })
    .on("end", () => {
      console.log(csvDataColl);
      fs.unlinkSync(path);
    });

  stream.pipe(fileStream);
}

function exportCSV(data: any[]) {
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(data);
  fs.writeFile("data.csv", csv, (err) => {
    if (err) {
      throw err;
    }
    console.log("File Saved!");
    return csv;
  });
}

const port = 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
