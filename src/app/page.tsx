"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Play, Pause, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"

type NoteValue = "quarter" | "eighth" | "sixteenth"

interface NoteConfig {
  label: string
  multiplier: number
  totalBeats: number
  subdivisions: number
}

const noteConfigs: Record<NoteValue, NoteConfig> = {
  quarter: { label: "Quarter Note", multiplier: 1, totalBeats: 4, subdivisions: 1 },
  eighth: { label: "8th Note", multiplier: 0.5, totalBeats: 8, subdivisions: 2 },
  sixteenth: { label: "16th Note", multiplier: 0.25, totalBeats: 16, subdivisions: 4 },
}

export default function MusicMetronome() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(120)
  const [noteValue, setNoteValue] = useState<NoteValue>("quarter")
  const [currentBeat, setCurrentBeat] = useState(0)
  const [volume, setVolume] = useState([0.7])
  const [selectedNumbers, setSelectedNumbers] = useState<[number, number]>([1, 2])
  const [currentNumberIndex, setCurrentNumberIndex] = useState(0)
  const [changeBeat, setChangeBeat] = useState(0)

  const [timerMinutes, setTimerMinutes] = useState(5)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [remainingTime, setRemainingTime] = useState(0)
  const [practiceRecords, setPracticeRecords] = useState<
    Array<{
      id: string
      duration: string
      bpm: number
      numbers: string
      timestamp: Date
    }>
  >([])

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const nextBeatTimeRef = useRef(0)
  const beatCountRef = useRef(0)

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const practiceStartTimeRef = useRef<Date | null>(null)
  const practiceStartBpmRef = useRef<number>(120)
  const practiceStartNumbersRef = useRef<string>("")

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [])

  // Create click sound
  const playClick = useCallback(
    (isAccent = false) => {
      if (!audioContextRef.current) return

      const ctx = audioContextRef.current
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      // Higher pitch for accented beats (first beat of measure)
      oscillator.frequency.setValueAtTime(isAccent ? 1000 : 800, ctx.currentTime)
      oscillator.type = "square"

      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(volume[0] * 0.3, ctx.currentTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)

      oscillator.start(ctx.currentTime)
      oscillator.stop(ctx.currentTime + 0.1)
    },
    [volume],
  )

  // Calculate interval based on BPM and note value
  const getInterval = useCallback(() => {
    const baseInterval = 60000 / bpm // milliseconds per quarter note
    return baseInterval * noteConfigs[noteValue].multiplier
  }, [bpm, noteValue])

  // Timer functions
  const startTimer = useCallback(() => {
    const totalSeconds = timerMinutes * 60 + timerSeconds
    if (totalSeconds <= 0) return

    setRemainingTime(totalSeconds)
    setIsTimerRunning(true)
    practiceStartTimeRef.current = new Date()
    practiceStartBpmRef.current = bpm
    practiceStartNumbersRef.current = selectedNumbers.filter((n) => n !== 0).join(", ")

    timerIntervalRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          // Timer finished
          setIsTimerRunning(false)
          const endTime = new Date()
          const duration = practiceStartTimeRef.current
            ? Math.round((endTime.getTime() - practiceStartTimeRef.current.getTime()) / 1000)
            : totalSeconds

          const newRecord = {
            id: Date.now().toString(),
            duration: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`,
            bpm: practiceStartBpmRef.current,
            numbers: practiceStartNumbersRef.current,
            timestamp: endTime,
          }

          setPracticeRecords((prev) => [newRecord, ...prev])
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [timerMinutes, timerSeconds, bpm, selectedNumbers])

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    setIsTimerRunning(false)
    setRemainingTime(0)
  }, [])

  const resetTimer = useCallback(() => {
    stopTimer()
    setRemainingTime(0)
  }, [stopTimer])

  // Format remaining time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Start/stop metronome
  const toggleMetronome = useCallback(() => {
    if (isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setIsPlaying(false)
      setCurrentBeat(0)
      beatCountRef.current = 0
    } else {
      setIsPlaying(true)
      beatCountRef.current = 0
      setCurrentBeat(0)

      const tick = () => {
        const config = noteConfigs[noteValue]
        const currentBeatInCycle = beatCountRef.current % config.totalBeats
        const isAccent = beatCountRef.current % (4 / config.subdivisions) === 0

        // Check if we should change the number at the selected beat
        if (currentBeatInCycle === changeBeat) {
          setCurrentNumberIndex((prev) => (prev === 0 ? 1 : 0))
        }

        playClick(isAccent)
        setCurrentBeat(currentBeatInCycle)
        beatCountRef.current++
      }

      // Play first beat immediately
      tick()

      intervalRef.current = setInterval(tick, getInterval())
    }
  }, [isPlaying, getInterval, noteValue, playClick, changeBeat])

  // Update interval when BPM or note value changes
  useEffect(() => {
    if (isPlaying && intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = setInterval(() => {
        const config = noteConfigs[noteValue]
        const currentBeatInCycle = beatCountRef.current % config.totalBeats
        const isAccent = beatCountRef.current % (4 / config.subdivisions) === 0

        // Check if we should change the number at the selected beat
        if (currentBeatInCycle === changeBeat) {
          setCurrentNumberIndex((prev) => (prev === 0 ? 1 : 0))
        }

        playClick(isAccent)
        setCurrentBeat(currentBeatInCycle)
        beatCountRef.current++
      }, getInterval())
    }
  }, [bpm, noteValue, isPlaying, getInterval, playClick, changeBeat])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

  // Render beat dots
  const renderBeatDots = () => {
    const config = noteConfigs[noteValue]
    const dots = []

    for (let i = 0; i < config.totalBeats; i++) {
      const isMainBeat = noteValue === "sixteenth" ? i % 4 === 0 : noteValue === "eighth" ? i % 2 === 0 : true
      const isActive = i === currentBeat
      const isChangeBeat = i === changeBeat
      const isAccentBeat = noteValue === "sixteenth" ? i % 4 === 0 : noteValue === "eighth" ? i % 2 === 0 : i % 4 === 0

      dots.push(
        <button
          key={i}
          onClick={() => setChangeBeat(i)}
          className={`
            rounded-full transition-all duration-100 border-2
            ${isMainBeat ? "w-4 h-4" : "w-2 h-2"}
            ${isActive
              ? isAccentBeat
                ? "bg-violet-500 scale-125"
                : "bg-blue-500 scale-125"
              : isMainBeat
                ? "bg-gray-300 dark:bg-gray-600"
                : "bg-gray-200 dark:bg-gray-700"
            }
            ${isChangeBeat ? "border-yellow-400" : "border-transparent"}
            hover:scale-110 cursor-pointer
          `}
        />,
      )
    }

    return dots
  }

  return (
    <div className="flex gap-6 max-w-6xl mx-auto p-6">
      {/* Left Panel - Number Grid */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4">
        <h3 className="text-lg font-semibold mb-4 text-center">Select Numbers</h3>
        <div className="grid grid-cols-5 gap-2 mb-4">
          {Array.from({ length: 25 }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              onClick={() => {
                if (selectedNumbers.includes(num)) {
                  // If already selected, don't deselect if it's the only one selected
                  if (selectedNumbers.filter((n) => n !== 0).length > 1) {
                    const newSelected = selectedNumbers.map((n) => (n === num ? 0 : n)) as [number, number]
                    setSelectedNumbers(newSelected)
                  }
                } else {
                  // Select this number, replacing the first available slot
                  const newSelected = [...selectedNumbers] as [number, number]
                  const emptyIndex = newSelected.findIndex((n) => n === 0)
                  if (emptyIndex !== -1) {
                    newSelected[emptyIndex] = num
                  } else {
                    // Replace the first number if both slots are full
                    newSelected[0] = num
                  }
                  setSelectedNumbers(newSelected)
                }
              }}
              className={`
                w-10 h-10 rounded text-sm font-medium transition-all
                ${selectedNumbers.includes(num)
                  ? "bg-blue-500 text-white scale-105"
                  : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
                }
              `}
            >
              {num}
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
          Selected: {selectedNumbers.filter((n) => n !== 0).join(", ")}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-500 text-center mt-2">
          Click yellow-bordered dot to set change position
        </div>
      </div>

      {/* Main Metronome */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 flex-1">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold mb-2">Music Metronome</h1>
          <p className="text-gray-600 dark:text-gray-400">Keep perfect time</p>
        </div>

        {/* Current Number Display */}
        <div className="text-center mb-2">
          <div className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">
            {selectedNumbers[currentNumberIndex]}
          </div>
        </div>

        {/* BPM Display */}
        <div className="text-center mb-6">
          <div className="text-4xl font-mono font-bold mb-2">{bpm}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">BPM</div>
        </div>

        {/* Beat Visualization */}
        <div className="flex justify-center items-center gap-2 mb-8 min-h-[2rem]">{renderBeatDots()}</div>

        {/* Controls */}
        <div className="space-y-6">
          {/* Play/Pause Button */}
          <div className="flex justify-center">
            <Button onClick={toggleMetronome} size="lg" className="w-16 h-16 rounded-full">
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
            </Button>
          </div>

          {/* BPM Control */}
          <div className="space-y-2">
            <Label htmlFor="bpm">Tempo (BPM)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="bpm"
                type="number"
                min="40"
                max="200"
                value={bpm}
                onChange={(e) => setBpm(Math.max(40, Math.min(200, Number.parseInt(e.target.value) || 120)))}
                className="w-20"
              />
              <Slider
                value={[bpm]}
                onValueChange={(value) => setBpm(value[0])}
                min={40}
                max={200}
                step={1}
                className="flex-1"
              />
            </div>
          </div>

          {/* Note Value Selection */}
          <div className="space-y-2">
            <Label htmlFor="note-value">Note Value</Label>
            <Select value={noteValue} onValueChange={(value: NoteValue) => setNoteValue(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quarter">Quarter Note (♩ = 1 beat)</SelectItem>
                <SelectItem value="eighth">8th Note (♫ = 1/2 beat)</SelectItem>
                <SelectItem value="sixteenth">16th Note (♬ = 1/4 beat)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Volume Control */}
          <div className="space-y-2">
            <Label htmlFor="volume" className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              Volume
            </Label>
            <Slider value={volume} onValueChange={setVolume} min={0} max={1} step={0.1} className="w-full" />
          </div>
        </div>

        {/* Current Settings Display */}
        <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm">
          <div className="flex justify-between items-center">
            <span>Current: {noteConfigs[noteValue].label}</span>
            <span>{isPlaying ? "Playing" : "Stopped"}</span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span>Numbers: {selectedNumbers.filter((n) => n !== 0).join(" ↔ ")}</span>
            <span>Change on beat: {changeBeat + 1}</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Timer and Records */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-4 w-80">
        <h3 className="text-lg font-semibold mb-4 text-center">Practice Timer</h3>

        {/* Timer Display */}
        <div className="text-center mb-4">
          <div className="text-3xl font-mono font-bold mb-2">
            {isTimerRunning ? formatTime(remainingTime) : `${timerMinutes}:${timerSeconds.toString().padStart(2, "0")}`}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {isTimerRunning ? "Time Remaining" : "Set Duration"}
          </div>
        </div>

        {/* Timer Controls */}
        {!isTimerRunning ? (
          <div className="space-y-4 mb-6">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="timer-minutes" className="text-xs">
                  Minutes
                </Label>
                <Input
                  id="timer-minutes"
                  type="number"
                  min="0"
                  max="60"
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(Math.max(0, Math.min(60, Number.parseInt(e.target.value) || 0)))}
                  className="text-center"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="timer-seconds" className="text-xs">
                  Seconds
                </Label>
                <Input
                  id="timer-seconds"
                  type="number"
                  min="0"
                  max="59"
                  value={timerSeconds}
                  onChange={(e) => setTimerSeconds(Math.max(0, Math.min(59, Number.parseInt(e.target.value) || 0)))}
                  className="text-center"
                />
              </div>
            </div>
            <Button onClick={startTimer} className="w-full" disabled={timerMinutes === 0 && timerSeconds === 0}>
              Start Timer
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 mb-6">
            <Button onClick={stopTimer} variant="outline" className="flex-1">
              Stop
            </Button>
            <Button onClick={resetTimer} variant="outline" className="flex-1">
              Reset
            </Button>
          </div>
        )}

        {/* Practice Records */}
        <div>
          <h4 className="font-semibold mb-3">Practice Records</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {practiceRecords.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No practice sessions yet</p>
            ) : (
              practiceRecords.map((record) => (
                <div key={record.id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium">{record.duration}</span>
                    <span className="text-xs text-gray-500">
                      {record.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">
                    <div>BPM: {record.bpm}</div>
                    <div>Numbers: {record.numbers}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
