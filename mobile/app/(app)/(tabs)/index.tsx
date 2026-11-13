import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useDsa, useProblem, type Difficulty } from '@dsa-portal/ui-core';
import { Body, Button, Card, Chip, ErrorText, H1, H2 } from '../../../src/components/ui';
import { useTheme } from '../../../src/theme';

const DIFFICULTIES: Array<Difficulty | null> = [null, 'Easy', 'Medium', 'Hard'];

/** Topic + difficulty, then a random matching problem (same flow as web and the CLI). */
export default function Practice() {
  const { api, stores } = useDsa();
  const { topic, difficulty, setFilters, loadRandom, loading, error } = useProblem();
  const { c, space } = useTheme();
  const [topics, setTopics] = useState<string[]>([]);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  useEffect(() => {
    api.topics().then(setTopics, (e: Error) => setTopicsError(e.message));
  }, [api]);

  const start = async () => {
    await loadRandom();
    const { problem, error: failed } = stores.problem.getState();
    if (problem && !failed) router.push(`/problem/${encodeURIComponent(problem.id)}`);
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: space.lg, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <Card>
        <H1>Practice</H1>
        <Body muted>Pick a topic and difficulty and get a random problem.</Body>
        <H2>Topic</H2>
        {topicsError && <ErrorText>{topicsError}</ErrorText>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }} accessibilityRole="radiogroup" accessibilityLabel="Topic">
          <Chip label="Any" selected={topic === null} onPress={() => setFilters(null, difficulty)} />
          {topics.map((t) => <Chip key={t} label={t} selected={topic === t} onPress={() => setFilters(t, difficulty)} />)}
        </View>
        <H2>Difficulty</H2>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }} accessibilityRole="radiogroup" accessibilityLabel="Difficulty">
          {DIFFICULTIES.map((d) => <Chip key={d ?? 'any'} label={d ?? 'Any'} selected={difficulty === d} onPress={() => setFilters(topic, d)} />)}
        </View>
        {error && <ErrorText>{error}</ErrorText>}
        <View style={{ marginTop: space.lg }}>
          <Button title="Start" primary busy={loading} onPress={() => void start()} />
        </View>
      </Card>
    </ScrollView>
  );
}
