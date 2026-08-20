import { useState } from 'react';
import { World } from './components/World';
import { StartScreen } from './components/StartScreen';

function App() {
  const [started, setStarted] = useState(false);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      <World />
      {!started && <StartScreen onStart={() => setStarted(true)} />}
    </div>
  );
}

export default App;
