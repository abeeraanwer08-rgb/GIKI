import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Props = {
  icon: string;
  items: string[];
};

export default function BulletList({ icon, items }: Props) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={index} style={styles.row}>
          <Text style={styles.icon}>{icon}</Text>
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
    marginBottom: 10,
  },
  icon: {
    fontSize: 14,
    marginRight: 10,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
  },
});
