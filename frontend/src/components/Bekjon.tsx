import { motion, type Variants } from 'framer-motion';

export type BekjonMood = 'happy' | 'sleeping' | 'hungry' | 'sport' | 'celebration';
export type BekjonAnimation = 'none' | 'bounce' | 'wiggle' | 'pop' | 'float';

export interface BekjonProps {
  mood?: BekjonMood;
  size?: number;
  animation?: BekjonAnimation;
  className?: string;
  onClick?: () => void;
}

const animations: Record<BekjonAnimation, Variants> = {
  none: {
    animate: {},
  },
  bounce: {
    animate: {
      y: [0, -8, 0],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
    },
  },
  wiggle: {
    animate: {
      rotate: [0, -5, 5, -5, 0],
      transition: { duration: 1, repeat: Infinity, ease: 'easeInOut' },
    },
  },
  pop: {
    animate: {
      scale: [1, 1.15, 1],
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  },
  float: {
    animate: {
      y: [0, -4, 0],
      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
    },
  },
};

export default function Bekjon({
  mood = 'happy',
  size = 200,
  animation = 'bounce',
  className = '',
  onClick,
}: BekjonProps) {
  return (
    <motion.img
      src={`/bekjon/${mood}.svg`}
      alt={`Bekjon ${mood}`}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, userSelect: 'none', cursor: onClick ? 'pointer' : 'default' }}
      draggable={false}
      onClick={onClick}
      variants={animations[animation]}
      animate="animate"
    />
  );
}