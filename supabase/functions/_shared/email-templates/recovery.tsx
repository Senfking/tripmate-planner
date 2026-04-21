/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password for {siteName}</Preview>
    <Body style={main}>
      <Container style={outer}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="Junto" height="32" style={logo} />
        </Section>
        <Container style={card}>
          <Heading style={h1}>Reset your password</Heading>
          <Text style={text}>
            We got a request to reset your Junto password. Tap the button below to choose a new one.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={confirmationUrl}>
              Reset password
            </Button>
          </Section>
          <Text style={footer}>
            Didn't ask for this? You can safely ignore this email — your password won't change.
          </Text>
        </Container>
        <Text style={legal}>© Junto · Plan trips together</Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
  margin: '0 0 18px',
}
const buttonSection = { margin: '28px 0 8px' }
const button = {
  backgroundColor: '#0D9488',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '999px',
  padding: '14px 32px',
  textDecoration: 'none',
  display: 'inline-block',
  boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)',
}
const footer = {
  fontSize: '13px',
  color: '#94A3B8',
  margin: '28px 0 0',
  lineHeight: '1.5',
}
const legal = {
  fontSize: '12px',
  color: 'rgba(255,255,255,0.6)',
  textAlign: 'center' as const,
  margin: '24px 0 0',
}
