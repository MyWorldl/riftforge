import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { fetchPlayerSearch, profileIconUrl, type PlayerSearchRow } from '../api/client'
import { parseRiotId } from '../lib/riotId'

interface PlayerSearchInputProps {
  region?: string
  ddragonPatch?: string
  placeholder?: string
  /** Sugestão da lista suspensa clicada/selecionada por teclado. */
  onSelect: (row: PlayerSearchRow) => void
  /** Enter (ou o botão "Buscar", se `showSubmitButton`) com texto que não
   *  bateu em nenhuma sugestão — parseado como "Nome#Tag" livre. `null`
   *  quando o texto não tem o formato esperado (usa pra mostrar erro). */
  onSubmitFreeText: (parsed: { gameName: string; tagLine: string } | null) => void
  showSubmitButton?: boolean
  className?: string
}

/** Busca "conforme digita" (ajuste 21/08) — compartilhado entre Home,
 *  Invocador e Análise do Jogador. Só sugere jogadores já indexados em
 *  `player_rankings` (`GET /rankings/search`, ligas apex já coletadas —
 *  NÃO é busca de qualquer jogador do mundo, universo pequeno hoje).
 *  Debounce de ~250ms evita 1 request por tecla. Digitar "Nome#Tag" na
 *  mão e apertar Enter continua funcionando pra quem não está nas
 *  sugestões (`onSubmitFreeText`), mesmo padrão ARIA combobox/listbox já
 *  usado em `FlagSelect.tsx`. */
function PlayerSearchInput({
  region,
  ddragonPatch,
  placeholder = 'Nome de jogador + #BR1',
  onSelect,
  onSubmitFreeText,
  showSubmitButton = false,
  className,
}: PlayerSearchInputProps) {
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<PlayerSearchRow[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const needle = value.trim()
    if (needle.length === 0) {
      setSuggestions([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setLoading(true)
      fetchPlayerSearch(needle, region, controller.signal)
        .then((rows) => {
          setSuggestions(rows)
          setActiveIndex(-1)
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') setSuggestions([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value, region])

  function commit(row: PlayerSearchRow) {
    onSelect(row)
    setValue('')
    setSuggestions([])
    setOpen(false)
  }

  function submitFreeText() {
    onSubmitFreeText(parseRiotId(value))
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (suggestions.length > 0) {
        setOpen(true)
        setActiveIndex((i) => (i + 1) % suggestions.length)
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (suggestions.length > 0) {
        setOpen(true)
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        commit(suggestions[activeIndex])
      } else {
        submitFreeText()
      }
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const showEmptyHint = open && !loading && value.trim().length > 0 && suggestions.length === 0

  return (
    <div className={`player-search ${className ?? ''}`} ref={rootRef}>
      <div className="player-search-row">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => value.trim() && setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {showSubmitButton && (
          <button type="button" className="player-search-submit" onClick={submitFreeText}>
            Buscar
          </button>
        )}
      </div>
      {open && (loading || suggestions.length > 0 || showEmptyHint) && (
        <ul className="player-search-menu" role="listbox" id={listboxId}>
          {loading && <li className="player-search-loading">Buscando...</li>}
          {!loading &&
            suggestions.map((row, index) => (
              <li key={`${row.region}-${row.game_name}-${row.tag_line}`}>
                <button
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`player-search-option ${index === activeIndex ? 'player-search-option-focus' : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commit(row)}
                >
                  {row.profile_icon_id != null && ddragonPatch && (
                    <img
                      src={profileIconUrl(ddragonPatch, row.profile_icon_id)}
                      alt=""
                      width={24}
                      height={24}
                      loading="lazy"
                    />
                  )}
                  <span className="player-search-option-name">
                    {row.game_name}#{row.tag_line}
                  </span>
                  <span className="player-search-option-tier">{row.tier}</span>
                </button>
              </li>
            ))}
          {!loading && showEmptyHint && (
            <li className="player-search-empty">
              Nenhum jogador conhecido com esse nome — aperte Enter pra buscar "Nome#Tag" diretamente.
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default PlayerSearchInput
