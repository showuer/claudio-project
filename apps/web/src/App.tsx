import Stage from './components/Stage';
import Card from './components/Card';
import HomePage from './pages/HomePage';

export default function App() {
  return (
    <Stage>
      <Card>
        <HomePage />
      </Card>
    </Stage>
  );
}
