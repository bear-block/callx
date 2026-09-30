import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {Callx, CallxError} from '@bear-block/callx';
import type {CallInput} from '@bear-block/callx';
import type {createCallxPreview} from '@bear-block/callx/preview';

export type Demo = ReturnType<typeof createCallxPreview>;
export interface HostStatus {
  platform: string;
  simulator: boolean;
  pushReady: boolean;
  pushToken?: string | null;
  events: string[];
  endpoints: {name: string; current: boolean}[];
}
interface NativeHost { invoke(method: string, arguments_: Record<string, unknown>): Promise<unknown> }
const nativeHost = NativeModules.CallxDeviceHost as NativeHost | undefined;
export const hasDeviceHost = Platform.OS !== 'web' && nativeHost !== undefined;

async function invoke(method: string, arguments_: Record<string, unknown> = {}): Promise<unknown> {
  if (!nativeHost) throw new CallxError('nativeUnavailable', 'Build the example development app to use Device mode.');
  return nativeHost.invoke(method, arguments_);
}
export async function hostStatus(): Promise<HostStatus> { return await invoke('status') as HostStatus; }
export async function selectEndpoint(index: number): Promise<unknown> { return invoke('selectAudioEndpoint', {index}); }
export async function requestPermissions(): Promise<void> {
  if (Platform.OS === 'ios') { if (nativeHost) await invoke('requestPermissions'); return; }
  if (Platform.OS !== 'android') return;
  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (Number(Platform.Version) >= 33) permissions.push(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  await PermissionsAndroid.requestMultiple(permissions);
}

/** The host readiness call waits for native cold-process recovery; errors never select a mock. */
export async function createDeviceDemo(): Promise<Demo> {
  await hostStatus();
  const callx = new Callx();
  async function currentCallId(): Promise<string> {
    const call = (await callx.getSnapshot()).call;
    if (!call) throw new CallxError('callNotFound', 'There is no current call.');
    return call.callId;
  }
  return {
    callx,
    simulator: {
      async incoming(input: CallInput) { await invoke('incoming', {...input}); },
      async remoteAnswered() { await invoke('remoteAnswered', {callId: await currentCallId()}); },
      async remoteEnded() { await invoke('remoteEnded', {callId: await currentCallId()}); },
      async mediaConnected() { await invoke('mediaConnected', {callId: await currentCallId()}); },
      async reset() { throw new CallxError('unsupported', 'Device calls must end through the native lifecycle.'); },
    },
  };
}
