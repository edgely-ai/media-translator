import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface ExtractAudioInput {
  inputPath: string;
  outputDir: string;
}

export interface ExtractAudioResult {
  outputPath: string;
  format: "wav";
  sampleRateHz: 16000;
  channels: 1;
}

function buildOutputPath(outputDir: string): string {
  return join(outputDir, "audio.wav");
}

async function runFfmpeg(args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `ffmpeg exited with code ${code ?? "unknown"} while extracting audio.${stderr ? ` ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

export async function extractAudio(
  input: ExtractAudioInput,
): Promise<ExtractAudioResult> {
  await mkdir(input.outputDir, { recursive: true });

  const outputPath = buildOutputPath(input.outputDir);

  await runFfmpeg([
    "-y",
    "-i",
    input.inputPath,
    "-vn",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    outputPath,
  ]);

  return {
    outputPath,
    format: "wav",
    sampleRateHz: 16000,
    channels: 1,
  };
}
