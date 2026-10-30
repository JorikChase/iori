/* loaded from inside the child frame onto the parent's context: can a tool page add its own processor to the shell's graph? */
class Child extends AudioWorkletProcessor { process(_, o) { for (const c of o[0]) c.fill(0.25); return true; } }
registerProcessor('probe-child', Child);
