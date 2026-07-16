function toggleCalendar(idx, el) {
    const rest = document.getElementById('calRest' + idx);
    if (rest.style.display === 'none') {
        rest.style.display = 'block';
        el.textContent = 'Свернуть ↑';
    } else {
        rest.style.display = 'none';
        el.textContent = `Показать ещё ${rest.children.length} →`;
    }
}
