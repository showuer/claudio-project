import { useState } from 'react';
import { useChatStore } from '../stores/chatStore';

interface Slot {
  id: string;
  label: string;
  timeRange: string;
  activity: string;
  musicIntent: string;
  tags: string[];
  energy: string;
}

const SLOTS: Slot[] = [
  { id: 'morning-wake', label: 'Morning Wake', timeRange: '07:00-09:00', activity: '起床 / 打开电脑', musicIntent: '轻快温暖，像一天刚打开时的第一束光', tags: ['WARM', 'LIGHT', 'PIANO'], energy: 'low-to-medium' },
  { id: 'deep-work', label: 'Deep Work', timeRange: '09:00-12:00', activity: '写代码 / 专注创作', musicIntent: '专注、少人声、稳定，像一条不打扰思路的工作轨道', tags: ['FOCUS', 'INSTRUMENTAL', 'AMBIENT'], energy: 'medium' },
  { id: 'noon-breath', label: 'Noon Break', timeRange: '12:00-13:30', activity: '午休 / 吃饭', musicIntent: '放松舒服，让中午变得松一点', tags: ['RELAX', 'CHILL', 'ACOUSTIC'], energy: 'low' },
  { id: 'afternoon-drive', label: 'Afternoon Drive', timeRange: '13:30-18:00', activity: '继续推进项目', musicIntent: '有推进感，帮助把事情继续往前做', tags: ['RHYTHM', 'CITY', 'STEADY'], energy: 'medium' },
  { id: 'evening-soften', label: 'Evening Soften', timeRange: '18:00-21:00', activity: '放松整理', musicIntent: '温暖有陪伴感，像房间里还亮着的一盏灯', tags: ['WARM', 'CHILL', 'VOCAL'], energy: 'low-to-medium' },
  { id: 'night-close', label: 'Night Close', timeRange: '21:00-00:00', activity: '准备休息', musicIntent: '安静低能量，适合睡前收心', tags: ['AMBIENT', 'PIANO', 'LATE-NIGHT'], energy: 'low' },
];

function getCurrentSlotId(): string | null {
  const minutes = new Date().getHours() * 60 + new Date().getMinutes();
  const ranges: [string, number, number][] = [
    ['morning-wake', 7*60, 9*60],
    ['deep-work', 9*60, 12*60],
    ['noon-breath', 12*60, 13.5*60],
    ['afternoon-drive', 13.5*60, 18*60],
    ['evening-soften', 18*60, 21*60],
    ['night-close', 21*60, 24*60],
  ];
  for (const [id, start, end] of ranges) {
    if (minutes >= start && minutes < end) return id;
  }
  return ranges[0][0];
}

export function SchedulePanel() {
  const [open, setOpen] = useState(false);
  const sendMessage = useChatStore(s => s.sendMessage);
  const isStreaming = useChatStore(s => s.isStreaming);
  const currentSlotId = getCurrentSlotId();

  const handleSelect = (slot: Slot) => {
    sendMessage(`${slot.label} — ${slot.musicIntent}`);
    setOpen(false);
  };

  return (
    <div className="schedule-wrap">
      <button className={`sec-head schedule-toggle ${open ? 'schedule-toggle--open' : ''}`}
        onClick={() => setOpen(o => !o)}>
        <span>SCHEDULE</span>
        <span>{SLOTS.length} SLOTS</span>
      </button>

      {open && (
        <div className="schedule-panel">
          <div className="schedule-panel-head">
            <span>DAILY PLANNER</span>
            <span>{SLOTS.length} SLOTS · LOCAL</span>
          </div>
          <div className="schedule-list">
            {SLOTS.map(slot => (
              <button
                key={slot.id}
                className={`schedule-slot ${slot.id === currentSlotId ? 'schedule-slot--current' : ''}`}
                onClick={() => handleSelect(slot)}
                disabled={isStreaming}
              >
                <span className="schedule-slot-time">{slot.timeRange}</span>
                <div className="schedule-slot-body">
                  <strong>{slot.label}</strong>
                  <em>{slot.tags.join(' / ')}</em>
                  <small>{slot.musicIntent}</small>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
