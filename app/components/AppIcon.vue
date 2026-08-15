<script setup lang="ts">
const props = defineProps<{ name: string }>()

const icons: Record<string, string> = {
  home: 'tabler:home',
  wa: 'tabler:brand-whatsapp',
  search: 'tabler:search',
  bed: 'tabler:bed',
  bath: 'tabler:bath',
  car: 'tabler:car',
  area: 'tabler:ruler-2',
  pin: 'tabler:map-pin',
  close: 'tabler:x',
  phone: 'tabler:phone',
  mail: 'tabler:mail',
}

const icon = computed(() => icons[props.name] ?? '')
</script>

<template>
  <Icon :name="icon" aria-hidden="true" />
</template>
