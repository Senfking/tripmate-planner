/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to start planning with Junto</Preview>
    <Body style={main}>
      <Container style={outer}>
        <Section style={logoSection}>
          <Text style={wordmark}>JUNTO</Text>
        </Section>
        <Container style={card}>
          <Heading style={h1}>Welcome aboard</Heading>
          <Text style={text}>
            Thanks for joining{' '}
            <Link href={siteUrl} style={link}>
              Junto
            </Link>
            . Group trips just got a whole lot easier.
          </Text>
          <Text style={text}>
            Confirm your email ({recipient}) to start planning your next trip:
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={confirmationUrl}>
              <span style={buttonText}>Confirm email</span>
            </Button>
          </Section>
          <Text style={footer}>
            If you didn't create a Junto account, you can safely ignore this email.
          </Text>
        </Container>
        <Text style={legal}>© Junto · Plan trips together</Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
const logoSection = { padding: '8px 0 28px', textAlign: 'center' as const }
const wordmark = {
  color: '#ffffff',
  fontSize: '32px',
  fontWeight: 800 as const,
  letterSpacing: '-0.02em',
  margin: 0,
  textAlign: 'center' as const,
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
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
const link = { color: '#0D9488', textDecoration: 'none', fontWeight: 600 as const }
const buttonSection = { margin: '28px 0 8px' }
const button = {
  backgroundColor: '#0D9488',
  backgroundImage: 'linear-gradient(135deg, #0D9488 0%, #0891b2 100%)',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '999px',
  padding: '14px 32px',
  textDecoration: 'none',
  display: 'inline-block',
  boxShadow: '0 6px 18px rgba(13, 148, 136, 0.4)',
}
const buttonText = {
  color: '#ffffff',
  textDecoration: 'none',
  fontWeight: 600 as const,
}
const footer = {
  fontSize: '13px',
  color: '#94A3B8',
  margin: '28px 0 0',
  lineHeight: '1.5',
}
const legal = {
  fontSize: '12px',
  color: 'rgba(255,255,255,0.7)',
  textAlign: 'center' as const,
  margin: '24px 0 0',
}
