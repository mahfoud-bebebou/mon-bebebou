'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function createSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

type BabyCount = 1 | 2 | 3
type Sexe = 'fille' | 'garcon' | ''
type Parcours = 'allaite' | 'artificiel' | 'mixte' | ''

export default function OnboardingPage() {
  const router = useRouter()

  const [familyName, setFamilyName] = useState('')
  const [babyPrenom, setBabyPrenom] = useState('')
  const [dateNaissance, setDateNaissance] = useState('')
  const [momName, setMomName] = useState('')
  const [dadName, setDadName] = useState('')
  const [babyCount, setBabyCount] = useState<BabyCount>(1)
  const [sexe, setSexe] = useState<Sexe>('')
  const [parcours, setParcours] = useState<Parcours>('')
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

  const selectBtnStyle = (selected: boolean): CSSProperties => ({
    padding: '10px 16px',
    borderRadius: 12,
    border: selected ? '1.5px solid #E8406A' : '1.5px solid #F0E8F8',
    backgroundColor: selected ? '#E8406A' : 'white',
    color: selected ? 'white' : '#4A3F5C',
    fontSize: 14,
    fontWeight: 600,
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
  })

  function validateForm(): string | null {
    if (!familyName.trim()) return 'Le nom de famille est requis.'
    if (!babyPrenom.trim()) return 'Le prénom du bébé est requis.'
    if (!dateNaissance) return 'La date de naissance est requise.'
    if (!momName.trim()) return 'Le prénom de maman est requis.'
    if (!dadName.trim()) return 'Le prénom de papa est requis.'
    if (!sexe) return 'Sélectionnez le sexe du bébé.'
    if (!parcours) return 'Sélectionnez votre parcours d\'alimentation.'
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }

    try {
      const { data: family, error: familyError } = await supabase
        .from('families')
        .insert({
          name: familyName.trim(),
          created_by: user.id,
        })
        .select()
        .single()

      if (familyError) throw familyError

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        prenom_maman: momName.trim(),
        prenom_papa: dadName.trim(),
        family_id: family.id,
      })

      if (profileError) throw profileError

      const babiesToInsert = Array.from({ length: babyCount }, () => ({
        prenom: babyPrenom.trim(),
        date_naissance: dateNaissance,
        sexe,
        poids_naissance: null,
        parcours,
        family_id: family.id,
      }))

      const { error: babiesError } = await supabase.from('babies').insert(babiesToInsert)

      if (babiesError) throw babiesError

      router.push('/')
    } catch (err) {
      console.error('[Onboarding]', err)
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Erreur lors de la création'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => router.back()}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 50,
          backgroundColor: 'white',
          border: '1.5px solid #F0E8F5',
          borderRadius: 20,
          padding: '8px 16px',
          fontSize: 14,
          color: '#8B7FA0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ← Retour
      </button>
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
            Créer le profil bébé
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
            Quelques infos pour personnaliser votre suivi
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

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Prénom bébé</label>
            <input
              type="text"
              value={babyPrenom}
              onChange={(e) => setBabyPrenom(e.target.value)}
              placeholder="Louise"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Date naissance</label>
            <input
              type="date"
              value={dateNaissance}
              onChange={(e) => setDateNaissance(e.target.value)}
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Prénom maman</label>
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
            <label style={labelStyle}>Prénom papa</label>
            <input
              type="text"
              value={dadName}
              onChange={(e) => setDadName(e.target.value)}
              placeholder="Thomas"
              style={inputStyle}
              disabled={loading}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Sexe</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSexe('garcon')}
                disabled={loading}
                style={selectBtnStyle(sexe === 'garcon')}
              >
                Garçon
              </button>
              <button
                type="button"
                onClick={() => setSexe('fille')}
                disabled={loading}
                style={selectBtnStyle(sexe === 'fille')}
              >
                Fille
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Nombre de bébés</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                [1, '1'],
                [2, 'Jumeaux'],
                [3, 'Triplés'],
              ] as [BabyCount, string][]).map(([count, label]) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setBabyCount(count)}
                  disabled={loading}
                  style={selectBtnStyle(babyCount === count)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Parcours</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                ['allaite', 'Allaitement'],
                ['artificiel', 'Lait artificiel'],
                ['mixte', 'Mixte'],
              ] as [Parcours, string][]).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setParcours(value)}
                  disabled={loading}
                  style={selectBtnStyle(parcours === value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: 14,
              background: 'linear-gradient(135deg, #E8406A, #F472B6)',
              color: 'white',
              fontSize: 16,
              fontWeight: 700,
              border: 'none',
              boxShadow: '0 4px 16px rgba(232,64,106,0.35)',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Enregistrement...' : 'Commencer'}
          </button>
        </div>
      </div>
    </main>
    </>
  )
}
