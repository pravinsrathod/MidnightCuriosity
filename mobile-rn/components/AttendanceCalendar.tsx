import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface AttendanceCalendarProps {
  colors: any;
  attendanceData: Record<string, string>; // { 'YYYY-MM-DD': 'PRESENT' | 'ABSENT' | 'LATE' }
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({ 
  colors, 
  attendanceData, 
  selectedDate, 
  onDateSelect 
}) => {
  const [viewDate, setViewDate] = useState(new Date(selectedDate || new Date()));
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const changeMonth = (increment: number) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + increment);
    setViewDate(newDate);
  };

  const daysInMonth = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days = [];
    const startDay = firstDay.getDay();

    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
        days.push(new Date(year, month, i));
    }

    return days;
  }, [viewDate]);

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const month = '' + (d.getMonth() + 1);
    const day = '' + d.getDate();
    const year = d.getFullYear();
    return [year, month.padStart(2, '0'), day.padStart(2, '0')].join('-');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PRESENT': return colors.success;
      case 'ABSENT': return colors.danger;
      case 'LATE': return colors.warning;
      default: return 'transparent';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Weekdays */}
      <View style={styles.weekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <Text key={i} style={styles.weekDayText}>{day}</Text>
        ))}
      </View>

      {/* Days Grid */}
      <View style={styles.daysGrid}>
        {daysInMonth.map((date, index) => {
          if (!date) return <View key={`empty-${index}`} style={styles.dayCell} />;

          const dateStr = formatDate(date);
          const isSelected = selectedDate === dateStr;
          const status = attendanceData[dateStr];
          const statusColor = getStatusColor(status);
          const isToday = new Date().toDateString() === date.toDateString();

          return (
            <TouchableOpacity
              key={dateStr}
              onPress={() => onDateSelect(dateStr)}
              style={[
                styles.dayCell,
                isSelected && styles.selectedCell,
                isToday && !isSelected && styles.todayCell
              ]}
            >
              <Text style={[
                styles.dayNumber,
                isSelected && styles.selectedText,
                isToday && !isSelected && styles.todayText
              ]}>
                {date.getDate()}
              </Text>
              {status && (
                <View style={[
                    styles.indicator, 
                    { backgroundColor: statusColor }
                ]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
          <Text style={styles.legendText}>Present</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendText}>Absent</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
          <Text style={styles.legendText}>Late</Text>
        </View>
      </View>
    </View>
  );
};

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  weekDayText: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
  },
  dayCell: {
    width: 40,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 10,
  },
  selectedCell: {
    backgroundColor: colors.primary,
  },
  todayCell: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  dayNumber: {
    fontSize: 14,
    color: colors.text,
  },
  selectedText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  todayText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
  }
});
