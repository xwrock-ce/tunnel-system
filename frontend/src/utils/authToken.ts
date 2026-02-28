const TOKEN_KEY = 'token'
const REMEMBER_ME_KEY = 'remember_me'

export const getStoredToken = (): string | null => {
  const localToken = localStorage.getItem(TOKEN_KEY)
  if (localToken) {
    return localToken
  }

  return sessionStorage.getItem(TOKEN_KEY)
}

export const setStoredToken = (token: string, remember: boolean): void => {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)

  if (remember) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(REMEMBER_ME_KEY, '1')
    return
  }

  sessionStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(REMEMBER_ME_KEY, '0')
}

export const clearStoredToken = (): void => {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

export const getRememberMePreference = (): boolean => localStorage.getItem(REMEMBER_ME_KEY) === '1'
