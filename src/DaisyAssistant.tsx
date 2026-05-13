/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Zap, Globe, AlertCircle, MessageSquare, History } from 'lucide-react';
import { AudioStreamer } from './lib/audio-streamer';
import { LiveSession, ConnectionState } from './lib/gemini-live';

const DaisyAssistant: React.FC = () => {
  const [sessionState, setSessionState] = useState<ConnectionState>('disconnected');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<string>('');
  const [showHistory, setShowHistory] = useState(false);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const liveSessionRef = useRef<LiveSession | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">API Key Missing</h1>
          <p className="text-gray-400">Please provide a GEMINI_API_KEY in your environment variables to talk to Daisy.</p>
        </div>
      </div>
    );
  }

  const handleToolCall = async (name: string, args: any) => {
    if (name === 'openWebsite') {
      window.open(args.url, '_blank');
      return { status: 'success', message: `Opening ${args.url}` };
    }
    return { status: 'error', message: 'Unknown tool' };
  };

  const toggleConnection = async () => {
    if (sessionState === 'connected' || sessionState === 'connecting') {
      liveSessionRef.current?.disconnect();
      audioStreamerRef.current?.stop();
      setSessionState('disconnected');
      setIsListening(false);
      setIsSpeaking(false);
      return;
    }

    try {
      const streamer = new AudioStreamer((chunk) => {
        liveSessionRef.current?.sendAudio(chunk);
      });
      streamer.setPlaybackStateCallback((isPlaying) => {
        setIsSpeaking(isPlaying);
      });
      audioStreamerRef.current = streamer;

      const session = new LiveSession(apiKey, {
        onAudioData: (base64) => {
          streamer.playChunk(base64);
        },
        onTextData: (text) => {
          setTranscript(prev => prev + ' ' + text);
        },
        onInterrupted: () => {
          streamer.stopPlayback();
          setIsSpeaking(false);
        },
        onStateChange: (state) => {
          setSessionState(state);
          if (state === 'connected') {
            setIsListening(true);
          } else {
            setIsListening(false);
            setIsSpeaking(false);
            audioStreamerRef.current?.stop();
          }
        },
        onToolCall: handleToolCall
      });
      liveSessionRef.current = session;

      await streamer.start();
      analyserRef.current = streamer.analyser;
      renderVisualizer();

      await session.connect();
    } catch (err) {
      console.error(err);
      setSessionState('error');
    }
  };

  const renderVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 80;

      // Draw outer pulse
      const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      const scale = 1 + (avg / 128) * 0.5;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * scale, 0, 2 * Math.PI);
      ctx.fillStyle = isSpeaking ? 'rgba(236, 72, 153, 0.2)' : 'rgba(59, 130, 246, 0.2)';
      ctx.fill();

      // Draw inner core
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = isSpeaking ? '#ec4899' : '#3b82f6';
      ctx.shadowBlur = 20;
      ctx.shadowColor = isSpeaking ? '#ec4899' : '#3b82f6';
      ctx.fill();

      // Draw waveform around orb
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      for (let i = 0; i < bufferLength; i += 4) {
        const angle = (i / bufferLength) * Math.PI * 2;
        const amplitude = (dataArray[i] / 255) * 40;
        const x = centerX + Math.cos(angle) * (radius + amplitude);
        const y = centerY + Math.sin(angle) * (radius + amplitude);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    };

    draw();
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      liveSessionRef.current?.disconnect();
      audioStreamerRef.current?.stop();
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden flex flex-col items-center justify-between font-sans selection:bg-pink-500/30">
      {/* Background Gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-pink-900/20 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="z-10 w-full p-6 flex justify-between items-center bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
          <h1 className="text-lg font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Daisy AI
          </h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-gray-500">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-yellow-500" />
            LIVE
          </span>
          <span className="px-2 py-1 rounded bg-white/5 border border-white/10 uppercase">
            {sessionState}
          </span>
        </div>
      </header>

      {/* Main Visualizer Area */}
      <main className="flex-1 w-full flex flex-col items-center justify-center relative">
        <div className="relative w-[300px] h-[300px] flex items-center justify-center">
            <AnimatePresence>
                {sessionState === 'connected' && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute inset-0 flex items-center justify-center"
                    >
                        <canvas 
                            ref={canvasRef} 
                            width={400} 
                            height={400} 
                            className="w-full h-full"
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {sessionState === 'disconnected' && (
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center"
                >
                    <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mx-auto mb-6 border border-white/10">
                        <Mic className="w-10 h-10 text-gray-500" />
                    </div>
                    <p className="text-gray-400 text-sm italic font-serif">"Hey, you gonna say something or just stare?"</p>
                </motion.div>
            )}

            {sessionState === 'connecting' && (
                 <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="w-20 h-20 rounded-full border-2 border-t-pink-500 border-gray-800"
                 />
            )}
        </div>

        {/* Live Transcript Bubble */}
        <AnimatePresence>
            {transcript && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="max-w-[80%] max-h-32 overflow-y-auto mt-4 px-4 py-2 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md text-center custom-scrollbar"
                >
                    <p className="text-gray-300 text-sm italic">"{transcript}"</p>
                </motion.div>
            )}
        </AnimatePresence>

        {/* Status Text */}
        <div className="mt-8 text-center px-6">
            <AnimatePresence mode="wait">
                {isSpeaking ? (
                    <motion.p 
                        key="speaking"
                        initial={{ opacity:0, y: 10 }}
                        animate={{ opacity:1, y: 0 }}
                        exit={{ opacity:0, y: -10 }}
                        className="text-pink-400 font-medium text-lg"
                    >
                        Daisy is sharing her wisdom...
                    </motion.p>
                ) : isListening ? (
                    <motion.p 
                        key="listening"
                        initial={{ opacity:0, y: 10 }}
                        animate={{ opacity:1, y: 0 }}
                        exit={{ opacity:0, y: -10 }}
                        className="text-blue-400 font-medium text-lg"
                    >
                        I'm all ears, babe.
                    </motion.p>
                ) : null}
            </AnimatePresence>
        </div>
      </main>

      {/* Controls */}
      <footer className="z-10 w-full p-8 flex flex-col items-center gap-6 bg-gradient-to-t from-black/80 to-transparent">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleConnection}
          className={`
            w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300
            ${sessionState === 'connected' 
              ? 'bg-red-500/20 border-2 border-red-500 text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' 
              : 'bg-white text-black shadow-[0_0_30px_rgba(255,255,255,0.3)]'}
          `}
        >
          {sessionState === 'connected' ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
        </motion.button>
        
        <p className="text-gray-500 text-xs tracking-widest uppercase mb-4">
            {sessionState === 'connected' ? 'TAP TO DISCONNECT' : 'TAP TO START SESSION'}
        </p>

        {/* Footer Links/Info */}
        <div className="flex gap-8 opacity-40">
            <button 
                onClick={() => {
                    setTranscript('');
                }}
                className="p-2 hover:opacity-100 transition-opacity"
                title="Clear Transcript"
            >
                <History className="w-5 h-5" />
            </button>
            <button className="p-2 hover:opacity-100 transition-opacity" onClick={() => window.open('https://github.com', '_blank')}>
                <AlertCircle className="w-5 h-5" />
            </button>
        </div>
      </footer>
    </div>
  );
};

export default DaisyAssistant;
