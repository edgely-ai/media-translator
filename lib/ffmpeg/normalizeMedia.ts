import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

export type NormalizedMediaKind = "video" | "audio";

export interface NormalizeMediaInput {
  inputPath: string;
  outputDir: string;
  kind: NormalizedMediaKind;
}

export interface NormalizedMediaResult {
  outputPath: string;
  kind: NormalizedMediaKind;
  format: "mp4" | "wav";
}

function buildOutputPath(
  outputDir: string,
  kind: NormalizedMediaKind,
): string {
  const filename = kind === "video" ? "source.mp4" : "source.wav";

  return join(outputDir, filename);
}

function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  kind: NormalizedMediaKind,
): string[] {
  if (kind === "video") {
    return [
      "-y",
      "-i",
      inputPath,
      "-vf",
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      outputPath,
    ];
  }

  return [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-c:a",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    outputPath,
  ];
}

function inferKindFromPath(inputPath: string): NormalizedMediaKind | null {
  const extension = extname(inputPath).toLowerCase();

  if ([".mp4", ".mov", ".webm"].includes(extension)) {
    return "video";
  }

  if ([".mp3", ".m4a", ".wav", ".webm"].includes(extension)) {
    return "audio";
  }

  return null;
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
          `ffmpeg exited with code ${code ?? "unknown"} while normalizing media.${stderr ? ` ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

export async function normalizeMedia(
  input: NormalizeMediaInput,
): Promise<NormalizedMediaResult> {
  const inferredKind = inferKindFromPath(input.inputPath);

  if (inferredKind && inferredKind !== input.kind) {
    throw new Error(
      `Input path ${input.inputPath} does not look like ${input.kind} media.`,
    );
  }

  await mkdir(dirname(buildOutputPath(input.outputDir, input.kind)), {
    recursive: true,
  });

  const outputPath = buildOutputPath(input.outputDir, input.kind);
  const args = buildFfmpegArgs(input.inputPath, outputPath, input.kind);

  await runFfmpeg(args);

  return {
    outputPath,
    kind: input.kind,
    format: input.kind === "video" ? "mp4" : "wav",
  };
}
