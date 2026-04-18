# Skill: Music Notation Rendering (VexFlow)

Render sheet music notation inline in chapter markdown using VexFlow. Use this whenever the chapter references specific notes, chords, passages, or patterns that the reader should *see* on a staff.

## CDN

```
https://cdn.jsdelivr.net/npm/vexflow@5.0.0/build/cjs/vexflow.js
```

Included automatically by `build-book.sh` — no manual setup needed.

## When to Use

- You're discussing a specific melody, chord, or passage — show it
- You're pointing out a pattern (repeated motif, interval leap, chord shape) — render the notes and highlight the pattern
- You're comparing two passages — show them side by side
- You're analyzing a real piece — show the actual notation with annotations
- The reader would otherwise need to go find sheet music to follow along

## When NOT to Use

- Generic explanation of what a "note" is (use prose)
- Abstract discussion of theory without reference to specific notes
- Simple interval examples that are obvious from text ("C to G is a fifth")

## Template

Every VexFlow block must be wrapped in an IIFE inside a `<script>` tag. Use unique element IDs (e.g., `notation-L05-melody`). The font loading is async, so all drawing must go inside the `.then()` callback.

```html
<div class="notation-block">
<div id="notation-LNN-description"></div>
<div class="caption">What this shows and what to notice</div>
</div>

<script>
(function() {
  VexFlow.loadFonts('Bravura', 'Academico').then(function() {
    VexFlow.setFonts('Bravura', 'Academico');

    var f = new VexFlow.Factory({
      renderer: { elementId: 'notation-LNN-description', width: 600, height: 200 }
    });

    var system = f.System({ width: 550 });

    var notes = [
      f.StaveNote({ keys: ['c/4'], duration: 'q' }),
      f.StaveNote({ keys: ['e/4'], duration: 'q' }),
      f.StaveNote({ keys: ['g/4'], duration: 'q' }),
      f.StaveNote({ keys: ['c/5'], duration: 'q' }),
    ];

    var voice = f.Voice({ numBeats: 4, beatValue: 4 }).addTickables(notes);
    system.addStave({ voices: [voice] }).addClef('treble').addTimeSignature('4/4');
    f.draw();
  });
})();
</script>
```

### Voices with more than 4 notes (scales, long passages)

VexFlow's `Voice` in strict mode enforces that total note ticks match the declared `numBeats`/`beatValue`. If you have more notes than fit a standard time signature (e.g., 8 quarter notes for a full scale), strict mode throws `BadArgument: Too many ticks` and the visual renders blank.

**Fix**: Use `VoiceMode.SOFT` to disable tick validation:

```javascript
// Instead of: f.Voice({ numBeats: 8, beatValue: 4 })  ← will throw "Too many ticks"
// Use:
var voice = f.Voice().setMode(VexFlow.VoiceMode.SOFT).addTickables(notes);
```

Use `SOFT` mode whenever you're showing scales, arpeggios, or any sequence that isn't meant to fit a real time signature. Use strict mode (the default) only when you're rendering actual metered music and want VexFlow to catch beat-count mistakes.

## API Quick Reference

### Note Durations

| Duration string | Meaning        |
|-----------------|----------------|
| `'w'`           | Whole note     |
| `'h'`           | Half note      |
| `'q'`           | Quarter note   |
| `'8'`           | Eighth note    |
| `'16'`          | Sixteenth note |
| `'qd'`          | Dotted quarter |
| `'hd'`          | Dotted half    |

### Note Pitches

Format: `'notename/octave'` — e.g., `'c/4'` is middle C, `'a/4'` is A above middle C.

Sharps and flats: `'c#/4'`, `'bb/4'`, `'f#/5'`.

### Chords

Multiple keys in one StaveNote:

```javascript
f.StaveNote({ keys: ['c/4', 'e/4', 'g/4'], duration: 'q' })  // C major chord
```

### Rests

```javascript
f.StaveNote({ keys: ['b/4'], duration: 'qr' })  // quarter rest ('r' suffix)
```

### Highlighting / Coloring Notes

Color a notehead:
```javascript
notes[2].setKeyStyle(0, { fillStyle: '#c0392b' });  // red notehead
```

Color the stem:
```javascript
notes[2].setStemStyle({ strokeStyle: '#c0392b' });
```

`keyIndex` is 0-based, lowest to highest within the chord.

### Key Signatures

```javascript
system.addStave({ voices: [voice] })
  .addClef('treble')
  .addKeySignature('Am')     // A minor (no sharps/flats)
  .addTimeSignature('4/4');
```

Common key signature strings: `'C'`, `'G'`, `'D'`, `'F'`, `'Bb'`, `'Am'`, `'Em'`, `'Dm'`.

### Multiple Staves (Grand Staff / Piano)

```javascript
var system = f.System({ width: 550 });

// Treble (right hand)
var trebleNotes = [ /* ... */ ];
var trebleVoice = f.Voice({ numBeats: 4, beatValue: 4 }).addTickables(trebleNotes);

// Bass (left hand)
var bassNotes = [ /* ... */ ];
var bassVoice = f.Voice({ numBeats: 4, beatValue: 4 }).addTickables(bassNotes);

system.addStave({ voices: [trebleVoice] }).addClef('treble').addKeySignature('Am');
system.addStave({ voices: [bassVoice] }).addClef('bass').addKeySignature('Am');
system.addConnector('brace');       // curly brace connecting the staves
system.addConnector('singleLeft');  // barline on the left

f.draw();
```

### Beaming (Grouping Eighth Notes)

```javascript
var notes = [
  f.StaveNote({ keys: ['c/4'], duration: '8' }),
  f.StaveNote({ keys: ['d/4'], duration: '8' }),
  f.StaveNote({ keys: ['e/4'], duration: '8' }),
  f.StaveNote({ keys: ['f/4'], duration: '8' }),
];

var beams = VexFlow.Beam.generateBeams(notes);
// After f.draw():
beams.forEach(function(b) { b.setContext(f.getContext()).draw(); });
```

### Ties and Slurs

```javascript
var tie = new VexFlow.StaveTie({
  first_note: notes[0],
  last_note: notes[1],
  first_indices: [0],
  last_indices: [0],
});
// After f.draw():
tie.setContext(f.getContext()).draw();
```

### Annotations (Text Below/Above Notes)

```javascript
notes[0].addModifier(new VexFlow.Annotation('root')
  .setVerticalJustification(VexFlow.Annotation.VerticalJustify.BOTTOM));
```

### Accidentals

```javascript
f.StaveNote({ keys: ['f#/4'], duration: 'q' })
  .addModifier(new VexFlow.Accidental('#'));

f.StaveNote({ keys: ['bb/4'], duration: 'q' })
  .addModifier(new VexFlow.Accidental('b'));
```

## Full Annotated Example: Highlighting a Pattern

This example shows an A minor arpeggio with the chord tones highlighted in red and passing tones in default black:

```html
<div class="notation-block">
<div id="notation-L09-arpeggio-pattern"></div>
<div class="caption">Left-hand arpeggio in Le Monde — red notes are the A minor chord tones (A, C, E), black notes are passing tones connecting them</div>
</div>

<script>
(function() {
  VexFlow.loadFonts('Bravura', 'Academico').then(function() {
    VexFlow.setFonts('Bravura', 'Academico');

    var f = new VexFlow.Factory({
      renderer: { elementId: 'notation-L09-arpeggio-pattern', width: 600, height: 200 }
    });

    var system = f.System({ width: 550 });

    var notes = [
      f.StaveNote({ keys: ['a/3'], duration: '8' }),   // chord tone
      f.StaveNote({ keys: ['b/3'], duration: '8' }),   // passing
      f.StaveNote({ keys: ['c/4'], duration: '8' }),   // chord tone
      f.StaveNote({ keys: ['d/4'], duration: '8' }),   // passing
      f.StaveNote({ keys: ['e/4'], duration: '8' }),   // chord tone
      f.StaveNote({ keys: ['d/4'], duration: '8' }),   // passing
      f.StaveNote({ keys: ['c/4'], duration: '8' }),   // chord tone
      f.StaveNote({ keys: ['b/3'], duration: '8' }),   // passing
    ];

    // Highlight chord tones (A, C, E) in red
    [0, 2, 4, 6].forEach(function(i) {
      notes[i].setKeyStyle(0, { fillStyle: '#c0392b' });
      notes[i].setStemStyle({ strokeStyle: '#c0392b' });
    });

    var beams = VexFlow.Beam.generateBeams(notes);
    var voice = f.Voice({ numBeats: 4, beatValue: 4 }).addTickables(notes);

    system.addStave({ voices: [voice] }).addClef('bass').addKeySignature('Am');
    f.draw();
    beams.forEach(function(b) { b.setContext(f.getContext()).draw(); });
  });
})();
</script>
```

## Common Patterns

1. **"Here's the chord" → show block chord on staff with note names annotated**
2. **"Here's the arpeggio pattern" → show the same chord broken into sequence, highlight chord tones**
3. **"Notice the interval" → show two notes, annotate the distance**
4. **"Compare major vs minor" → two side-by-side staves, highlight the differing note in each**
5. **"This is the melody" → show a phrase from the piece, color notes by function (chord tone vs passing)**
6. **"This is what the left hand does" → bass clef staff showing the accompaniment pattern**
