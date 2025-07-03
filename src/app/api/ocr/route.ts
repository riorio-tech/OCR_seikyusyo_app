import { NextRequest, NextResponse } from 'next/server';
import vision from '@google-cloud/vision';

export async function POST(req: NextRequest) {
  const { imageBase64 } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: 'No image' }, { status: 400 });
  }
  try {
    const client = new vision.ImageAnnotatorClient({
      credentials: JSON.parse(process.env.GCP_KEY_JSON!)
    });
    const [result] = await client.textDetection({
      image: { content: imageBase64.replace(/^data:image\/\w+;base64,/, '') }
    });
    const text = result.fullTextAnnotation?.text || '';
    return NextResponse.json({ text });
  } catch (e: unknown) {
    return NextResponse.json({ error: 'OCR failed', detail: String(e) }, { status: 500 });
  }
} 