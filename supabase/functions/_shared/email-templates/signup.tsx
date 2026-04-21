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
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to start planning with {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <Img src={LOGO_URL} alt="Junto" width="56" height="56" style={logo} />
        </Section>
        <Heading style={h1}>Welcome aboard!</Heading>
        <Text style={text}>
          Thanks for joining{' '}
          <Link href={siteUrl} style={link}>
            <strong>Junto</strong>
          </Link>
          . We're glad you're here — group trips just got a whole lot easier.
        </Text>
        <Text style={text}>
          Confirm your email ({recipient}) to start planning your next trip:
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            Confirm email
          </Button>
        </Section>
        <Text style={footer}>
          If you didn't create a Junto account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const LOGO_URL =
  'https://dwtbqomfleihcvkfoopm.supabase.co/storage/v1/object/public/email-assets/junto-logo.png'

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const logoSection = { marginBottom: '24px' }
const logo = { borderRadius: '12px', display: 'block' }
const h1 = {
  fontSize: '24px',
  fontWeight: 700 as const,
  color: '#0F3D3A',
  margin: '0 0 16px',
  letterSpacing: '-0.01em',
}
const text = {
  fontSize: '15px',
  color: '#475569',
  lineHeight: '1.6',
  margin: '0 0 20px',
}
const link = { color: '#0D9488', textDecoration: 'none' }
const buttonSection = { margin: '28px 0' }
const button = {
  backgroundColor: '#0D9488',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 600 as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = {
  fontSize: '13px',
  color: '#94A3B8',
  margin: '32px 0 0',
  lineHeight: '1.5',
}
