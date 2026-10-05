import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import ffmpegStatic from 'ffmpeg-static';

/** ffmpeg binary: $SHIPREEL_FFMPEG, then ffmpeg-static, then `ffmpeg` on PATH. */
export function ffmpegPath(): string {
  const fromEnv = process.env.SHIPREEL_FFMPEG;
  if (fromEnv) return fromEnv;
  const bundled = ffmpegStatic as unknown as string | null;
  if (bundled && existsSync(bundled)) return bundled;
  return 'ffmpeg';
}

export interface EncoderOptions {
  file: string;
  fps: number;
  durationSeconds: number;
  /** Optional background music; looped if shorter, faded in/out, trimmed to the video length. */
  music?: string;
  /** x264 quality (lower is better). Default 18. */
  crf?: number;
}

export interface Encoder {
  write(frame: Buffer): Promise<void>;
  end(): Promise<void>;
  abort(): void;
}

export function encoderArgs(options: EncoderOptions): string[] {
  const { fps, durationSeconds, music } = options;
  // Frames are always JPEG; declaring the decoder avoids flaky probing of near-uniform first frames.
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0'];
  if (music) args.push('-stream_loop', '-1', '-i', music);
  args.push('-map', '0:v');
  if (music) {
    const fadeOut = Math.max(0, durationSeconds - 1.5).toFixed(2);
    args.push(
      '-map', '1:a',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-af', `afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOut}:d=1.5`,
      '-t', durationSeconds.toFixed(3),
    );
  }
  args.push(
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', String(options.crf ?? 18),
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-r', String(fps),
    '-movflags', '+faststart',
    options.file,
  );
  return args;
}

/** Start ffmpeg reading JPEG frames from stdin and writing an H.264 MP4 (social-media friendly). */
export function startEncoder(options: EncoderOptions): Encoder {
  const proc: ChildProcessWithoutNullStreams = spawn(ffmpegPath(), encoderArgs(options), { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let failure: Error | undefined;
  const exited = new Promise<void>((resolve, reject) => {
    proc.on('error', (error) => {
      failure = new Error(`Could not start ffmpeg (${ffmpegPath()}): ${error.message}`);
      reject(failure);
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else {
        failure = new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`);
        reject(failure);
      }
    });
  });
  exited.catch(() => undefined);
  proc.stdin.on('error', () => undefined);

  return {
    async write(frame) {
      if (failure) throw failure;
      if (!proc.stdin.write(frame)) {
        await Promise.race([once(proc.stdin, 'drain'), exited]);
      }
    },
    async end() {
      proc.stdin.end();
      await exited;
    },
    abort() {
      proc.kill('SIGKILL');
    },
  };
}
