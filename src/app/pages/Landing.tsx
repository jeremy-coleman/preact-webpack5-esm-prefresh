import { h } from 'preact';
import { useState } from 'preact/hooks';

const Landing = ({path = "/"}) => {
  const [state, setState] = useState(0);

  return (
    <div>
      <p>Count: {state}</p>
      <button onClick={() => setState(state + 1)}>Increment</button>
    </div>
  )
}

export default Landing;
