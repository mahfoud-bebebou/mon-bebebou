'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { clearDemoSession, DEMO_SESSION_KEY, migrateDemoEvents } from '@/lib/demo'

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function RegisterPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [momName, setMomName] = useState('')
  const [dadName, setDadName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const labelStyle: CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: '#4A3F5C',
    marginBottom: 6,
    display: 'block',
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1.5px solid #F0E8F8',
    fontSize: 15,
    backgroundColor: '#FDF8F2',
    color: '#4A3F5C',
    outline: 'none',
    boxSizing: 'border-box',
  }

  function validateForm(): string | null {
    if (!email.trim()) return "L'email est requis."
    if (!password) return 'Le mot de passe est requis.'
    if (!momName.trim()) return 'Le prénom de maman est requis.'
    if (!dadName.trim()) return 'Le prénom de papa est requis.'
    if (!familyName.trim()) return 'Le nom de famille est requis.'
    return null
  }

  async function handleSubmit() {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError(null)

    const supabase = createSupabaseClient()

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (error) throw error

      const userId = data.user?.id
      if (!userId) throw new Error('Pas de user id')

      const { data: family, error: familyError } = await supabase
        .from('families')
        .insert({
          name: familyName.trim(),
          created_by: userId,
        })
        .select()
        .single()

      if (familyError) throw familyError

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: userId,
        email: email.trim(),
        prenom_maman: momName.trim(),
        prenom_papa: dadName.trim(),
        family_id: family.id,
      })

      if (profileError) throw profileError

      const sessionId = localStorage.getItem(DEMO_SESSION_KEY)
      if (sessionId) {
        await migrateDemoEvents(sessionId, userId)
        clearDemoSession()
      }

      router.push('/onboarding')
    } catch (err) {
      console.error('[Register]', err)
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Erreur lors de la création du compte'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        backgroundColor: '#FDF8F2',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        overflowY: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <header style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <img
            src="/logo-horizontal.png"
            alt="Mon Bebebou"
            style={{ width: '100%', maxWidth: 200, height: 'auto' }}
          />
        </header>

        <div
          style={{
            backgroundColor: 'white',
            borderRadius: 24,
            padding: 32,
            boxShadow: '0 8px 32px rgba(74,63,92,0.10)',
          }}
        >
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: '#4A3F5C',
              textAlign: 'center',
              margin: 0,
            }}
          >
            Créer un compte
          </h1>
          <p
            style={{
              fontSize: 14,
              color: '#8B7FA0',
              textAlign: 'center',
              marginTop: 8,
              marginBottom: 24,
            }}
          >
            Inscrivez votre famille pour commencer le suivi
          </p>

          {error && (
            <div
              style={{
                backgroundColor: '#FFF0F3',
                border: '1px solid #F9A8C0',
                borderRadius: 12,
                padding: 12,
                marginBottom: 20,
                color: '#C03060',
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@email.com"
              autoComplete="email"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Prénom de maman</label>
            <input
              type="text"
              value={momName}
              onChange={(e) => setMomName(e.target.value)}
              placeholder="Marie"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Prénom de papa</label>
            <input
              type="text"
              value={dadName}
              onChange={(e) => setDadName(e.target.value)}
              placeholder="Thomas"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Nom de famille</label>
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Ex: Benlakehal"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              backgroundColor: '#E8406A',
              color: 'white',
              fontSize: 16,
              fontWeight: 700,
              border: 'none',
              boxShadow: '0 4px 16px rgba(232,64,106,0.35)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Création...' : 'Créer mon compte'}
          </button>
        </div>
      </div>
    </main>
  )
}
