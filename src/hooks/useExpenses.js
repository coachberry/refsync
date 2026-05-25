import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { subscribeExpenses, addExpense, deleteExpense } from '@/services/firestore'
import toast from 'react-hot-toast'

export function useExpenses() {
  const { user } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeExpenses(user.uid, (data) => {
      setExpenses(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const add = async (data) => {
    try {
      await addExpense(user.uid, data)
      toast.success('Expense added')
    } catch {
      toast.error('Failed to add expense')
    }
  }

  const remove = async (id) => {
    try {
      await deleteExpense(id)
      toast.success('Expense removed')
    } catch {
      toast.error('Failed to remove expense')
    }
  }

  const total = expenses.reduce((sum, e) => sum + (e.amount ?? 0), 0)
  const byType = expenses.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + (e.amount ?? 0)
    return acc
  }, {})

  return { expenses, loading, add, remove, total, byType }
}
