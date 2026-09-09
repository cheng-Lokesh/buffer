# V12 Platform Voice Support

| Platform | Actual V12 support | Failure behavior |
| --- | --- | --- |
| Web desktop | Uses runtime `SpeechRecognition` / `webkitSpeechRecognition` only when supplied by the browser | Permission denial or missing capability reports the state and leaves text enabled |
| Mobile Web | Same capability detection and candidate-confirmation path in the 390×844 Bottom Sheet | Safe-area protected controls; denial returns immediately to text |
| WeChat Mini Program | Reliable transcription is not implemented in this release | The page says transcription is currently unavailable and the complete text path remains usable |

Voice is not an assistant. It only transcribes one statement, then uses the same parser, candidate review and explicit confirmation boundary as typed text. The browser acceptance suite exercises both a successful transcript fixture and a permission-denied fixture without writing before confirmation.
