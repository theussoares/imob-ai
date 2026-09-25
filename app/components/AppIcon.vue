<script setup lang="ts">
const props = defineProps<{ name: string }>()

const icons: Record<string, string> = {
  home: 'tabler:home',
  wa: 'tabler:brand-whatsapp',
  search: 'tabler:search',
  bed: 'tabler:bed',
  suite: 'tabler:door',
  bath: 'tabler:bath',
  car: 'tabler:car',
  area: 'tabler:ruler-2',
  pin: 'tabler:map-pin',
  close: 'tabler:x',
  menu: 'tabler:menu-2',
  phone: 'tabler:phone',
  mail: 'tabler:mail',
  'chevron-left': 'tabler:chevron-left',
  'chevron-right': 'tabler:chevron-right',
  expand: 'tabler:arrows-maximize',
  instagram: 'tabler:brand-instagram',
  world: 'tabler:world',
  link: 'tabler:link',
  // Painel: substituem os emojis que faziam papel de ícone (📍👤🔑🟡⚠️💡…).
  // Emoji muda de desenho a cada sistema, não aceita a cor do tema e o leitor
  // de tela o lê em voz alta ("alfinete vermelho", "círculo amarelo").
  lock: 'tabler:lock',
  user: 'tabler:user',
  key: 'tabler:key',
  alert: 'tabler:alert-triangle',
  check: 'tabler:circle-check',
  bulb: 'tabler:bulb',
  clock: 'tabler:clock',
  notes: 'tabler:notes',
  dashboard: 'tabler:layout-dashboard',
  users: 'tabler:users',
  contract: 'tabler:file-text',
  settings: 'tabler:settings',
  more: 'tabler:dots',
  eye: 'tabler:eye',
  'eye-off': 'tabler:eye-off',
  star: 'tabler:star',
  trash: 'tabler:trash',
  'arrow-left': 'tabler:arrow-left',
  'arrow-right': 'tabler:arrow-right',
  site: 'tabler:building-store',
  contacts: 'tabler:address-book',
  refresh: 'tabler:refresh',
  external: 'tabler:external-link',
  spark: 'tabler:sparkles',
  // CRM (0049): agenda, roleta e a linha do tempo do contato.
  calendar: 'tabler:calendar-event',
  roleta: 'tabler:arrows-shuffle',
  plus: 'tabler:plus',
  call: 'tabler:phone-call',
  etapa: 'tabler:arrow-right-circle',
  atribuicao: 'tabler:user-share',
  inbox: 'tabler:inbox',
  lost: 'tabler:circle-x',
}

const icon = computed(() => icons[props.name] ?? '')
</script>

<template>
  <Icon :name="icon" aria-hidden="true" />
</template>
