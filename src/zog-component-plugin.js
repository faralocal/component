/**
 * Zog.js Component Plugin
 *
 * @version 0.3.0 (Goblin Slayer Edition)
 * @license MIT
 */
export const ComponentPlugin = {
    install(api) {
        const { utils, addHook, watchEffect, reactive, ref } = api;
        const componentRegistry = new Map();

        // Helper to convert kebab-case to camelCase
        // e.g., "initial-value" -> "initialValue"
        const camelize = (str) => str.replace(/-(\w)/g, (_, c) => c.toUpperCase());

        addHook('onError', (err, context, args) => {
            console.error(`[Zog Error in ${context}]`, err);
            if (args) console.error('Context Args:', args);
        });

        const registerComponent = (name, definition) => {
            if (!definition.template) {
                console.warn(`[ComponentPlugin] Component "${name}" is missing a template.`);
                return;
            }
            componentRegistry.set(name.toLowerCase(), definition);
        };

        addHook('beforeCompile', (el, parentScope, parentCs) => {
            if (el.nodeType !== 1) return;

            const tagName = el.tagName.toLowerCase();
            const componentName = tagName.startsWith('z-') ? tagName.slice(2) : tagName;

            if (componentRegistry.has(componentName)) {
                const definition = componentRegistry.get(componentName);

                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = definition.template.trim();
                const componentRoot = tempContainer.firstElementChild;

                if (!componentRoot) {
                    console.error(`[ComponentPlugin] Template for <${componentName}> must have a single root element.`);
                    return false;
                }

                // Plain object for scope (solves reactivity confusion)
                const childScope = {}; 
                const parentListeners = {};

                const emit = (eventName, ...args) => {
                    const handlerCode = parentListeners[eventName];
                    if (!handlerCode) return;
                    try {
                        if (typeof parentScope[handlerCode] === 'function') {
                            parentScope[handlerCode](...args);
                        } else {
                            const fn = new Function(...Object.keys(parentScope), '$event', `"use strict"; ${handlerCode}`);
                            fn(...Object.values(parentScope), args[0]);
                        }
                    } catch (e) {
                        console.error(`[Emit Failed]`, e);
                    }
                };

                Array.from(el.attributes).forEach(attr => {
                    const { name, value } = attr;
                    if (name.startsWith(':')) {
                        // FIX: Camelize prop names so they are valid JS variables
                        // :initial-value -> initialValue
                        const propName = camelize(name.slice(1));
                        
                        parentCs.addEffect(watchEffect(() => {
                            try {
                                childScope[propName] = utils.evalExp(value, parentScope);
                            } catch (e) {
                                console.error(`[Prop Error]`, e);
                            }
                        }));
                    } else if (name.startsWith('@')) {
                        parentListeners[name.slice(1)] = value;
                    } else if (name === 'class') {
                        componentRoot.classList.add(...value.split(' ').filter(Boolean));
                    } else if (name === 'style') {
                        componentRoot.style.cssText += ';' + value;
                    } else {
                        // FIX: Camelize static props too
                        childScope[camelize(name)] = value;
                    }
                });

                if (definition.setup && typeof definition.setup === 'function') {
                    const setupResult = definition.setup(childScope, { emit });
                    if (setupResult && typeof setupResult === 'object') {
                        Object.assign(childScope, setupResult);
                    }
                }

                const slotEl = componentRoot.querySelector('slot');
                if (slotEl) {
                    while (el.childNodes.length > 0) {
                        const node = el.childNodes[0];
                        utils.compile(node, parentScope, parentCs);
                        slotEl.parentNode.insertBefore(node, slotEl);
                    }
                    slotEl.remove();
                }

                el.replaceWith(componentRoot);
                const componentCs = new utils.Scope();
                utils.compile(componentRoot, childScope, componentCs);

                return false;
            }

            return true;
        });

        return { registerComponent };
    }
};
