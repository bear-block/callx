// The CallxVideoView native component spec (ADR-0010). React Native's codegen reads this file
// (package.json codegenConfig) and generates the Fabric props and view manager interfaces.
import type {ViewProps} from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';
import type {WithDefault} from 'react-native/Libraries/Types/CodegenTypes';

export interface NativeProps extends ViewProps {
  callId: string;
  source?: WithDefault<'local' | 'remote', 'remote'>;
  fit?: WithDefault<'cover' | 'contain', 'cover'>;
  mirror?: WithDefault<boolean, false>;
}

export default codegenNativeComponent<NativeProps>('CallxVideoView');
