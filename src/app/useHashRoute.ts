import { useEffect, useState } from 'react'

const readRoute = () => window.location.hash.slice(1) || '/'

export function useHashRoute() {
  const [route, setRoute] = useState(readRoute)

  useEffect(() => {
    const updateRoute = () => setRoute(readRoute())
    window.addEventListener('hashchange', updateRoute)
    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])

  return route
}
