import React from 'react';
import { StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation/AppNavigator';
import { IdentityProvider } from './src/context/IdentityContext';
import { ChatProvider } from './src/context/ChatContext';
import { ChatSessionProvider } from './src/context/ChatSessionContext';

function Providers({ children }: { children: React.ReactNode }) {
  return (
    <IdentityProvider>
      <ChatProvider>
        <ChatSessionProvider>{children}</ChatSessionProvider>
      </ChatProvider>
    </IdentityProvider>
  );
}

function App(): JSX.Element {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Providers>
          <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
          <AppNavigator />
        </Providers>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
