/** Base class for renderer events passed through EventChannel. */
export class BaseEvent {
    /** Set to `true` by a subscriber to short-circuit the pipeline in sendAsync(). */
    handled = false;
}
