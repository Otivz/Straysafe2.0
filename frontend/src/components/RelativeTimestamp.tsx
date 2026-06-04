import { useEffect, useState } from 'react';

interface RelativeTimestampProps {
  date: string | number | Date;
}

export default function RelativeTimestamp({ date }: RelativeTimestampProps) {
  const [relativeTime, setRelativeTime] = useState('');

  useEffect(() => {
    const getRelativeTime = () => {
      if (!date) return 'Unknown date';
      
      let parsedDate: Date;
      if (typeof date === 'string') {
        // Handle MySQL format "YYYY-MM-DD HH:MM:SS" by replacing space with T
        let normalized = date.trim();
        if (normalized.includes(' ') && !normalized.includes('T')) {
          normalized = normalized.replace(' ', 'T');
        }
        parsedDate = new Date(normalized);
      } else {
        parsedDate = new Date(date);
      }

      if (isNaN(parsedDate.getTime())) {
        return typeof date === 'string' ? date : 'Invalid date';
      }

      const now = new Date();
      const diffMs = now.getTime() - parsedDate.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffSecs / 60);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      // If the date is in the future (e.g. minor time sync offset), return "just now"
      if (diffSecs < 0) {
        return 'just now';
      }

      if (diffSecs < 60) {
        return 'just now';
      }
      if (diffMins < 60) {
        return `${diffMins}m ago`;
      }
      if (diffHours < 24) {
        return `${diffHours}h ago`;
      }
      if (diffDays < 7) {
        return `${diffDays}d ago`;
      }
      
      // Fallback to a clean readable date
      return parsedDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    };

    setRelativeTime(getRelativeTime());
  }, [date]);

  return <span>{relativeTime}</span>;
}
