::: code-group

```ts [React Native / Expo]
import {configureLiveKit, resetLiveKit} from '@bear-block/callx-livekit';

await configureLiveKit({
  tokenUrl: 'https://api.example.com/calls/livekit-token',
  headers: {authorization: `Bearer ${sessionToken}`},
});

// On sign-out:
await resetLiveKit();
```

```dart [Flutter]
import 'package:callx_livekit/callx_livekit.dart';

await CallxLiveKit.configure(LiveKitConfig(
  tokenUrl: 'https://api.example.com/calls/livekit-token',
  headers: {'authorization': 'Bearer $sessionToken'},
));

// On sign-out:
await CallxLiveKit.reset();
```

:::
