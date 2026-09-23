import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconTint: string;
  items: string[];
};

export default function BulletList({ icon, iconColor, iconTint, items }: Props) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={index} style={[styles.row, index === items.length - 1 && styles.lastRow]}>
          <View style={[styles.iconBadge, { backgroundColor: iconTint }]}>
            <Ionicons name={icon} size={13} color={iconColor} />
          </View>
          <Text style={styles.text}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  lastRow: {
    marginBottom: 0,
  },
  iconBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: '#3A3F47',
    lineHeight: 20,
  },
});
