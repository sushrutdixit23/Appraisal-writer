import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Max 5MB." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();

    let text = "";
    try {
      if (name.endsWith(".pdf")) {
        const pdf = await getDocumentProxy(new Uint8Array(buffer));
        const result = await extractText(pdf, { mergePages: true });
        text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
      } else if (name.endsWith(".docx")) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
      } else if (name.endsWith(".txt")) {
        text = buffer.toString("utf-8");
      } else {
        return NextResponse.json(
          { error: "Unsupported file type. Upload a PDF, DOCX, or TXT file." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Could not read this file. Try pasting the text instead." },
        { status: 500 }
      );
    }

    text = text.trim();
    if (!text) {
      return NextResponse.json({ error: "No readable text found in this file." }, { status: 400 });
    }
    if (text.length > 8000) {
      text = text.slice(0, 8000);
    }

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong reading the file." }, { status: 500 });
  }
}
