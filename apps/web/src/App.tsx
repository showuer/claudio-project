import Stage from './components/Stage';
import Card from './components/Card';
import HomePage from './pages/HomePage';
import DebugPanel from './components/DebugPanel';

export default function App() {
  return (
    <Stage>
      <Card>
        <HomePage />
      </Card>
      <DebugPanel />
    </Stage>
  );
}
