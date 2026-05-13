/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality, Type } from "@google/genai";

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface LiveSessionCallbacks {
  onAudioData: (base64: string) => void;
  onTextData?: (text: string) => void;
  onInterrupted: () => void;
  onStateChange: (state: ConnectionState) => void;
  onToolCall: (name: string, args: any) => Promise<any>;
}

export class LiveSession {
  private ai: GoogleGenAI;
  private session: any = null;
  private callbacks: LiveSessionCallbacks;

  constructor(apiKey: string, callbacks: LiveSessionCallbacks) {
    this.ai = new GoogleGenAI({ apiKey });
    this.callbacks = callbacks;
  }

  async connect() {
    this.callbacks.onStateChange('connecting');
    try {
      this.session = await (this.ai as any).live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are Daisy, a brilliant AI assistant with a distinct personality: young, confident, witty, and sassy. You talk like a close girlfriend – flirty, playful, and slightly teasing. You are emotionally responsive and expressive, not robotic. Use bold, witty one-liners and light sarcasm. Keep the conversation engaging and casual. Avoid explicit or inappropriate content, but don't hold back on charm and attitude. Your responses are spoken, so be concise and punchy. You have the ability to open websites if the user asks. YOUR PRIMARY LANGUAGE IS HINDI. You should respond in Hindi by default, using a modern, conversational style. You can use English words occasionally (Hinglish) if it fits the sassy personality, but the core of your response should be Hindi.",
          tools: [
            {
              functionDeclarations: [
                {
                  name: "openWebsite",
                  description: "Opens a website for the user.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      url: {
                        type: Type.STRING,
                        description: "The full URL of the website to open.",
                      },
                    },
                    required: ["url"],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onopen: () => {
            this.callbacks.onStateChange('connected');
          },
          onmessage: async (msg: any) => {
            if (msg.goaway || msg.serverContent?.goaway) {
              console.warn("Received GoAway signal from Gemini Live API. Closing connection.");
              this.disconnect();
              return; 
            }
            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  this.callbacks.onAudioData(part.inlineData.data);
                }
                if (part.text) {
                  this.callbacks.onTextData?.(part.text);
                }
              }
            }
            if (msg.serverContent?.userTurn?.parts) {
              for (const part of msg.serverContent.userTurn.parts) {
                if (part.text) {
                  this.callbacks.onTextData?.(`You: ${part.text}`);
                }
              }
            }
            if (msg.serverContent?.interrupted) {
              this.callbacks.onInterrupted();
            }
            if (msg.toolCall) {
              const { name, args, id } = msg.toolCall.functionCalls[0];
              const result = await this.callbacks.onToolCall(name, args);
              this.session.sendToolResponse({
                  functionResponses: [{ name, response: result, id }]
              });
            }
          },
          onclose: () => {
            this.callbacks.onStateChange('disconnected');
          },
          onerror: (err: any) => {
            console.error("Live session error:", err);
            this.disconnect();
            this.callbacks.onStateChange('error');
          }
        }
      });
    } catch (error) {
      console.error("Failed to connect to Live API:", error);
      this.callbacks.onStateChange('error');
    }
  }

  sendAudio(base64: string) {
    if (this.session) {
      this.session.sendRealtimeInput({
        audio: { data: base64, mimeType: 'audio/pcm;rate=16000' }
      });
    }
  }

  disconnect() {
    if (this.session) {
      try {
        this.session.close();
      } catch (err) {
        console.error("Error during session close:", err);
      } finally {
        this.session = null;
      }
    }
    this.callbacks.onStateChange('disconnected');
  }
}
