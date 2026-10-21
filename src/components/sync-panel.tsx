import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { NetworkError, PbError } from '@/sync/client';
import { signIn, signOut, syncNow } from '@/sync/engine';
import { useSyncStatus } from '@/sync/status';
import { colors, fonts } from '@/theme';

import { SysButton } from './sys-button';
import { SysText } from './sys-text';
import { SystemWindow } from './system-window';

function ago(ms: number | null) {
  if (!ms) return 'never';
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return new Date(ms).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

const STATE_TEXT = { idle: 'Synced', syncing: 'Syncing…', offline: 'Offline', error: 'Error' } as const;

export function SyncPanel() {
  const status = useSyncStatus();
  const [url, setUrl] = useState(status.serverUrl ?? '');
  const [email, setEmail] = useState(status.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await signIn(url, email, password);
      setPassword('');
    } catch (e) {
      setFormError(
        e instanceof NetworkError
          ? 'Could not reach the server. Check the URL and that Tailscale is connected.'
          : e instanceof PbError && e.status === 400
            ? 'Wrong email or password.'
            : e instanceof Error
              ? e.message
              : String(e),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'Your data stays on this phone. Changes made while signed out sync when you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  if (status.signedIn) {
    const color = status.state === 'idle' ? colors.cyan : status.state === 'syncing' ? colors.textMuted : colors.dangerSoft;
    return (
      <SystemWindow title="SYNC">
        <Row label="Account" value={status.email ?? ''} />
        <Row label="Server" value={status.serverUrl ?? ''} />
        <Row label="Status" value={STATE_TEXT[status.state]} valueColor={color} />
        <Row label="Last sync" value={ago(status.lastSyncAt)} />
        <Row label="Waiting to upload" value={String(status.pending)} />
        {status.error ? <SysText style={styles.error}>{status.error}</SysText> : null}
        <SysText variant="caption" style={{ fontSize: 11 }}>
          Syncs when the app opens and every 5 minutes while it&apos;s open. Use Sync Now for anything urgent.
        </SysText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SysButton label="SYNC NOW" style={{ flex: 1 }} disabled={status.state === 'syncing'} onPress={() => syncNow()} />
          <SysButton label="SIGN OUT" variant="ghost" style={{ flex: 1 }} onPress={confirmSignOut} />
        </View>
      </SystemWindow>
    );
  }

  return (
    <SystemWindow title="SYNC">
      <SysText variant="caption">
        Back up to your PocketBase server over Tailscale. Your quests keep working offline either way.
      </SysText>
      <Field label="SERVER URL">
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="https://your-pc.your-tailnet.ts.net"
          placeholderTextColor={colors.textDone}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          accessibilityLabel="Server URL"
        />
      </Field>
      <Field label="EMAIL">
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          style={styles.input}
          accessibilityLabel="Email"
        />
      </Field>
      <Field label="PASSWORD">
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          style={styles.input}
          accessibilityLabel="Password"
        />
      </Field>
      {formError ?? status.error ? <SysText style={styles.error}>{formError ?? status.error}</SysText> : null}
      <SysButton
        label={busy ? 'CONNECTING…' : 'CONNECT'}
        disabled={busy || !url.trim() || !email.trim() || !password}
        onPress={connect}
      />
    </SystemWindow>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <SysText variant="label" style={{ fontSize: 13 }}>
        {label}
      </SysText>
      {children}
    </View>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.row}>
      <SysText variant="caption" style={{ fontSize: 13 }}>
        {label}
      </SysText>
      <SysText style={{ fontSize: 13, color: valueColor ?? colors.text, flexShrink: 1, textAlign: 'right' }} numberOfLines={1}>
        {value}
      </SysText>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.panelRow,
    color: colors.text,
    paddingHorizontal: 12,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  error: { fontSize: 12, lineHeight: 18, color: colors.dangerSoft },
});
