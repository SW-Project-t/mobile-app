import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="StudentDashboard" />
      <Stack.Screen name="ProfessorDashboard" />
      <Stack.Screen name="AdminDashboard" />
    </Stack>
  );
}