// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.yarukotoapp.com',
  integrations: [
    starlight({
      title: 'Yarukoto',
      description: 'Documentation for Yarukoto, a self-hosted todo app.',
      logo: { src: './src/assets/logo.png', alt: '' },
      favicon: '/favicon.png',
      customCss: ['./src/styles/theme.css'],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/wyne/yarukoto' }],
      editLink: { baseUrl: 'https://github.com/wyne/yarukoto/edit/main/docs/' },
      lastUpdated: true,
      sidebar: [
        { label: 'Introduction', link: '/' },
        {
          label: 'Getting started',
          items: ['getting-started/docker', 'getting-started/synology'],
        },
        {
          label: 'Using the apps',
          items: ['using/apps', 'using/household', 'using/reminders', 'using/delete-account', 'using/support'],
        },
        {
          label: 'Self-hosting',
          items: ['self-hosting/configuration', 'self-hosting/reverse-proxy', 'self-hosting/backups'],
        },
        {
          label: 'Integrations',
          items: ['integrations/ai-assistants', 'integrations/home-assistant'],
        },
        {
          label: 'Reference',
          items: ['reference/api', 'reference/limitations'],
        },
        {
          label: 'Development',
          items: [
            'development/setup',
            'development/architecture',
            'development/feature-compatibility',
            'development/ios-and-android',
            'development/mac',
            'development/windows',
            'development/web-demo',
          ],
        },
      ],
    }),
  ],
});
