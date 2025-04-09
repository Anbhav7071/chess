import { spawn, ChildProcess } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface EngineEvaluation {
  type: 'cp' | 'mate';
  value: number;
}

interface EngineOptions {
  fen?: string;
  depth?: number;
  movetime?: number;
}

class ChessEngine {
  private readonly fenHistory: Map<string, number> = new Map();
  private engine: ChildProcess | null = null;
  private ready = false;
  private currentBestMove: string | null = null;
  private currentEvaluation: EngineEvaluation | null = null;
  private responseBuffer = '';
  private readonly requestQueue: (() => Promise<void>)[] = [];
  private isProcessing = false;
  private bestMoveResolver: ((move: string) => void) | null = null;
  private bestMoveRejecter: ((error: Error) => void) | null = null;
  private timeout: NodeJS.Timeout | null = null;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    try {
      const enginePath = resolve(__dirname, '../../stockfish/stockfish-windows-x86-64-avx2.exe');
      this.engine = spawn(enginePath);

      this.engine.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        const messages = (this.responseBuffer + text).split('\n');
        this.responseBuffer = messages.pop() || '';

        for (const message of messages) {
          const trimmedMessage = message.trim();
          this.handleEngineResponse(trimmedMessage);

          if (trimmedMessage.startsWith('bestmove') && this.bestMoveResolver) {
            const move = trimmedMessage.split(' ')[1];

            if (this.timeout) {
              clearTimeout(this.timeout);
              this.timeout = null;
            }

            const resolver = this.bestMoveResolver;
            this.bestMoveResolver = null;
            this.bestMoveRejecter = null;
            resolver(move);
          }
        }
      });

      this.engine.stderr?.on('data', (data: Buffer) => {
        console.error('Stockfish Error:', data.toString());
      });

      this.engine.on('error', (error) => {
        console.error('Stockfish process error:', error);
        this.restartEngine();
      });

      this.engine.on('close', () => {
        this.ready = false;
        this.restartEngine();
      });

      this.initializeEngine();
    } catch (error) {
      console.error('Failed to initialize Stockfish:', error);
    }
  }

  private initializeEngine(): void {
    this.sendCommand('uci');
    this.sendCommand('setoption name Threads value 4');
    this.sendCommand('setoption name Hash value 2048');
    this.sendCommand('setoption name Skill Level value 20');
    this.sendCommand('isready');
  }

  private sendCommand(command: string): void {
    if (!this.engine?.stdin?.write(command + '\n')) {
      console.error('Failed to send command:', command);
    }
  }

  private handleEngineResponse(message: string): void {
    if (message === 'uciok') {
      console.debug('Engine is ready to receive commands');
    } else if (message === 'readyok') {
      this.ready = true;
      console.debug('Engine is ready');
    } else if (message.startsWith('bestmove')) {
      this.currentBestMove = message.split(' ')[1];
    } else if (message.startsWith('info depth')) {
      this.parseEvaluationInfo(message);
    }
  }

  public async getBestMove(options: EngineOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await this.waitForReady();
          this.resetAnalysisState();

          this.bestMoveResolver = resolve;
          this.bestMoveRejecter = reject;

          if (options.fen) {
            this.sendCommand(`position fen ${options.fen}`);
          }

          const goCommand = `go ${options.movetime ? 'movetime ' + options.movetime : 'depth ' + (options.depth || 5)}`;
          this.sendCommand(goCommand);

          this.timeout = setTimeout(() => {
            console.error('Timeout: Stockfish did not respond with a bestmove');

            if (this.bestMoveRejecter) {
              const rejecter = this.bestMoveRejecter;
              this.bestMoveResolver = null;
              this.bestMoveRejecter = null;
              rejecter(new Error('Stockfish did not respond with a bestmove'));
            }
          }, 30000);
        } catch (error) {
          console.error('Error during best move calculation:', error);
          reject(error);
        } finally {
          setTimeout(() => this.processNextRequest(), 100);
        }
      });

      if (!this.isProcessing) {
        this.processNextRequest();
      }
    });
  }

  public async evaluatePosition(options: EngineOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          await this.waitForReady();
          this.resetAnalysisState();

          if (options.fen) {
            this.sendCommand(`position fen ${options.fen}`);
          }

          const goCommand = `go depth ${options.depth ?? 15}`;
          this.sendCommand(goCommand);

          const waitForEval = () => {
            if (this.currentEvaluation) {
              resolve();
            } else {
              setTimeout(waitForEval, 50);
            }
          };

          waitForEval();
        } catch (error) {
          console.error('Error during evaluation:', error);
          reject(error);
        } finally {
          setTimeout(() => this.processNextRequest(), 100);
        }
      });

      if (!this.isProcessing) {
        this.processNextRequest();
      }
    });
  }

  public async getEvaluation(): Promise<EngineEvaluation | null> {
    return this.currentEvaluation;
  }

  public async getWinProbabilities(fen: string, depth = 10): Promise<{ whiteWinProb: number; blackWinProb: number }> {
    try {
      // Evaluate the position using the given FEN and depth
      await this.evaluatePosition({ fen, depth });
      const evaluation = await this.getEvaluation();
  
      if (!evaluation) {
        throw new Error("No evaluation available.");
      }
  
      console.debug(`Evaluation received: ${JSON.stringify(evaluation)}`);
  
      let whiteWinProb = 0.5; // Default to equal probability
  
      // Handle centipawn (cp) evaluation
      if (evaluation.type === "cp") {
        // Use a sigmoid function for centipawn scaling
        whiteWinProb = 1 / (1 + Math.exp(-evaluation.value / 400));
      } 
      // Handle mate evaluation
      else if (evaluation.type === "mate") {
        whiteWinProb = evaluation.value > 0 ? 1 : 0; // Mate in X moves means a guaranteed win
      }
  
      // Clamp the probability between 0 and 1
      whiteWinProb = Math.max(0, Math.min(1, whiteWinProb));
      const blackWinProb = 1 - whiteWinProb; // Black's probability is the complement of White's
  
      // Check for draw scenarios
      if (this.isDrawByInsufficientMaterial(fen) || this.isDrawByRepetition(fen) || this.isDrawByFiftyMoveRule(fen)) {
        console.debug("Draw scenario detected. Setting probabilities to 50% for both sides.");
        return { whiteWinProb: 0.5, blackWinProb: 0.5 };
      }
  
      console.debug(`Win probabilities calculated: White: ${whiteWinProb}, Black: ${blackWinProb}`);
  
      return { whiteWinProb, blackWinProb };
    } catch (error) {
      console.error('Error computing win probabilities:', error);
  
      // Return default probabilities in case of an error
      return { whiteWinProb: 0.5, blackWinProb: 0.5 };
    }
  }

  private isDrawByInsufficientMaterial(fen: string): boolean {
    const position = fen.split(" ")[0]; // Extract the board position from the FEN
    const pieces = position.replace(/\//g, "").replace(/\d/g, ""); // Remove slashes and numbers
  
    // Check for insufficient material scenarios
    const isInsufficient = 
      pieces === "kK" || // King vs King
      pieces === "kKb" || pieces === "kBk" || // King and Bishop vs King
      pieces === "kKn" || pieces === "kNk"; // King and Knight vs King
  
    return isInsufficient;
  }

  private isDrawByRepetition(fen: string): boolean {
    // This requires tracking the game history and counting identical positions.
    // For simplicity, assume a method `this.getRepetitionCount(fen)` exists that returns the count of repetitions.
    const repetitionCount = this.getRepetitionCount(fen);
    return repetitionCount >= 3;
  }

  private isDrawByFiftyMoveRule(fen: string): boolean {
    const halfMoveClock = parseInt(fen.split(" ")[4], 10); // Extract the half-move clock from the FEN
    return halfMoveClock >= 50;
  }


private getRepetitionCount(fen: string): number {
  // Get the count of the current FEN from the history
  return this.fenHistory.get(fen) ?? 0;
}

private updateFenHistory(fen: string): void {
  // Increment the count for the current FEN in the history
  const count = this.fenHistory.get(fen) ?? 0;
  this.fenHistory.set(fen, count + 1);
}

  private async waitForReady(): Promise<void> {
    if (this.ready) return;

    return new Promise((resolve) => {
      const checkReady = () => {
        if (this.ready) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }

  private resetAnalysisState(): void {
    this.currentBestMove = null;
    this.currentEvaluation = null;
  }

  private parseEvaluationInfo(info: string): void {
    const parts = info.split(' ');
    const scoreIndex = parts.indexOf('score');
  
    if (scoreIndex === -1) return; // No score information found
  
    const scoreType = parts[scoreIndex + 1]; // 'cp' or 'mate'
    const scoreValue = parseInt(parts[scoreIndex + 2], 10); // Parse the value after 'cp' or 'mate'
  
    if ((scoreType === 'cp' || scoreType === 'mate') && !isNaN(scoreValue)) {
      this.currentEvaluation = {
        type: scoreType,
        value: scoreValue,
      };
  
      // Log the evaluation, including mate values
      if (scoreType === 'mate') {
        console.debug(`Mate detected: Mate in ${scoreValue > 0 ? scoreValue : -scoreValue} moves (${scoreValue > 0 ? 'White' : 'Black'} wins)`);
      } else if (scoreType === 'cp') {
        console.debug(`Centipawn evaluation: ${scoreValue}`);
      }
  
      console.debug(`Evaluation parsed: ${JSON.stringify(this.currentEvaluation)}`);
    } else {
      console.warn(`Unexpected score format in Stockfish response: ${info}`);
    }
  }

  private processNextRequest(): void {
    if (this.requestQueue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const nextRequest = this.requestQueue.shift();
    if (nextRequest) {
      nextRequest();
    }
  }

  private restartEngine(): void {
    this.quit();
    this.initialize();
  }

  public quit(): void {
    if (this.engine) {
      this.sendCommand('quit');
      this.engine.kill();
      this.ready = false;
    }
  }
}

export const chessEngine = new ChessEngine();
