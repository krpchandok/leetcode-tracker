import { useState } from 'react'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'
import Streaks from './components/streaks'

const handleStreakClick = (numStreaks: number) => {
  if (numStreaks >= 3) {
    alert(`You're on a roll with ${numStreaks} streaks! Keep it up!`);
  } else {
    alert(`You have ${numStreaks} streaks. Keep going!`);
  }
}

function App() {
  const [streaks, setStreaks] = useState(0)

  return (
    <>
      <Streaks
        streaks={streaks}
        onARoll={streaks >= 3}
        handleClick={() => handleStreakClick(streaks)}
      />
    </>
  )
}

export default App
