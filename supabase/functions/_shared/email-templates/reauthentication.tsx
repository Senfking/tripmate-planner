/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Junto verification code</Preview>
    <Body style={main}>
      <Container style={outer}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="Junto" height="32" style={logo} />
        </Section>
        <Container style={card}>
          <Heading style={h1}>Confirm it's you</Heading>
          <Text style={text}>Use this code to confirm your identity:</Text>
          <Section style={{ textAlign: 'center' as const, margin: '24px 0' }}>
            <Text style={codeStyle}>{token}</Text>
          </Section>
          <Text style={footer}>
            This code expires shortly. If you didn't request it, you can safely ignore this email.
          </Text>
        </Container>
        <Text style={legal}>© Junto · Plan trips together</Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const LOGO_URL =
  'https://dwtbqomfleihcvkfoopm.supabase.co/storage/v1/object/public/email-assets/junto-wordmark.png'

const main = {
  background: 'linear-gradient(160deg, #0F3D3A 0%, #0D9488 60%, #0891b2 100%)',
  backgroundColor: '#0F3D3A',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  margin: 0,
  padding: '40px 16px',
  minHeight: '100%',
}
const outer = { maxWidth: '560px', margin: '0 auto', padding: 0 }
const logoSection = { padding: '8px 0 24px', textAlign: 'center' as const }
const logo = { display: 'inline-block', height: '32px', width: 'auto' }
const card = {
  backgroundColor: '#ffffff',
  borderRadius: '20px',
  padding: '40px 36px',
  boxShadow: '0 10px 40px rgba(15, 61, 58, 0.18)',
}
const h1 = {
  fontSize: '26px',
  fontWeight: 700 as const,
  color: '#0F3D3A',
  margin: '0 0 16px',
  letterSpacing: '-0.02em',
  lineHeight: '1.2',
}
const text = {
  fontSize: '15px',
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 12px',
}
const codeStyle = {
  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
  fontSize: '32px',
  fontWeight: 700 as const,
  color: '#0F3D3A',
  letterSpacing: '0.25em',
  backgroundColor: '#F0FDFA',
  border: '1px solid #CCFBF1',
  padding: '18px 28px',
  borderRadius: '14px',
  display: 'inline-block',
  margin: 0,
}
const footer = {
  fontSize: '13px',
  color: '#94A3B8',
  margin: '20px 0 0',
  lineHeight: '1.5',
}
const legal = {
  fontSize: '12px',
  color: 'rgba(255,255,255,0.6)',
  textAlign: 'center' as const,
  margin: '24px 0 0',
}
