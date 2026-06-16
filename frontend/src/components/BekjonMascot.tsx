import { motion, AnimatePresence } from 'framer-motion';

interface BekjonMascotProps {
    calorieProgress: number; // 0-150+ foiz
    size?: number;
}

type Mood = 'happy' | 'sleeping' | 'hungry' | 'sport' | 'celebration';

function getMood(progress: number): Mood {
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 6) return 'sleeping';
    if (progress >= 100 && progress <= 110) return 'celebration';
    if (progress > 110) return 'sport';
    if (progress >= 60) return 'happy';
    return 'hungry';
}

const moodMessages: Record<Mood, string> = {
    happy: 'Yaxshi ketyapsiz! 💪',
    sleeping: "Tinch tun, ertaga ko'rishamiz 🌙",
    hungry: 'Hali ovqatlanmadingiz...',
    sport: "Ko'p yedingiz, biroz harakat kerak 🏃",
    celebration: 'Maqsadga yetdingiz! 🎉',
};

export default function BekjonMascot({ calorieProgress, size = 180 }: BekjonMascotProps) {
    const mood = getMood(calorieProgress);

    return (
        <div className="flex flex-col items-center gap-2">
            <AnimatePresence mode="wait">
                <motion.img
                    key={mood}
                    src={`/bekjon/${mood}.svg`}
                    alt={`Bekjon ${mood}`}
                    width={size}
                    height={size}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 26 }}
                    className="drop-shadow-[0_8px_24px_rgba(91,106,208,0.15)]"
                />
            </AnimatePresence>
            <motion.p
                key={`msg-${mood}`}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm font-medium text-gray-700 text-center"
            >
                {moodMessages[mood]}
            </motion.p>
        </div>
    );
}